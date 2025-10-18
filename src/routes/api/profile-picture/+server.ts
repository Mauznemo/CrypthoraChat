import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { base64ToArrayBuffer } from '$lib/crypto/utils';
import sharp from 'sharp';
import { getUploadDir } from '$lib/server/fileUpload';

const UPLOAD_PATH = getUploadDir() + '/profiles';

let serverKeyPromise: Promise<CryptoKey> | null = null;
async function getServerKey(): Promise<CryptoKey> {
	if (!serverKeyPromise) {
		const rawKey = base64ToArrayBuffer(process.env.PROFILE_PIC_KEY!);
		serverKeyPromise = crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, [
			'encrypt',
			'decrypt'
		]);
	}
	return serverKeyPromise;
}

function getMimeType(fileExtension: string): string {
	switch (fileExtension.toLowerCase()) {
		case 'png':
			return 'image/png';
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		case 'webp':
			return 'image/webp';
		case 'gif':
			return 'image/gif';
		default:
			return 'application/octet-stream';
	}
}

// GET /profile-pic?filePath=./uploads/profiles/<uuid>.png.enc
export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		const filePathParam = url.searchParams.get('filePath');
		if (!filePathParam) {
			throw error(400, 'Missing filePath');
		}

		const absPath = path.resolve(filePathParam);
		if (!absPath.startsWith(path.resolve(UPLOAD_PATH))) {
			throw error(400, 'Invalid filePath');
		}

		const combined = await fs.readFile(absPath);

		const iv = combined.slice(0, 12);
		const encryptedData = combined.slice(12);

		const serverKey = await getServerKey();
		const decrypted = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv },
			serverKey,
			encryptedData
		);

		const sizeParam = url.searchParams.get('size');
		let outputBuffer: Buffer;

		if (sizeParam) {
			const size = parseInt(sizeParam, 10);
			outputBuffer = await sharp(Buffer.from(decrypted))
				.resize(size, size, {
					fit: 'cover'
				})
				.toBuffer();
		} else {
			outputBuffer = Buffer.from(decrypted);
		}

		const ext = path.extname(absPath).replace('.', '');
		const mimeType = getMimeType(ext);

		// Return image with caching headers
		return new Response(new Uint8Array(outputBuffer), {
			headers: {
				'Content-Type': mimeType,
				'Cache-Control': 'public, max-age=31536000, immutable'
			}
		});
	} catch (e: any) {
		console.error('Failed to get profile picture:', e);
		throw error(404, 'Image not found');
	}
};
