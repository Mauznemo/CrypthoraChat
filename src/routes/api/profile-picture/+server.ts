import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { base64ToArrayBuffer } from '$lib/crypto/utils';
import sharp from 'sharp';
import { getUploadDir, validateUploadPath } from '$lib/server/fileUpload';

const UPLOAD_PATH = getUploadDir() + '/profiles';

/** Avatars are never displayed larger than this, and it keeps a resize cheap. */
const MAX_IMAGE_SIZE = 512;

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

		const validation = validateUploadPath(filePathParam);
		if (!validation.ok) {
			throw error(403, 'Invalid filePath');
		}

		// Narrower than validateUploadPath: this route is public, so it only ever serves profile
		// pictures. Compared with a trailing separator so a sibling like /uploads/profiles-old
		// cannot pass a plain prefix test.
		const absPath = validation.absolute;
		const profilesDir = path.resolve(UPLOAD_PATH);
		if (absPath !== profilesDir && !absPath.startsWith(profilesDir + path.sep)) {
			throw error(403, 'Invalid filePath');
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
			// Bounded rather than whitelisted: an allow-list of exact sizes silently 404s every
			// caller that asks for a value nobody remembered to add (the chat avatars ask for 64,
			// read receipts for 32). The cap is what matters here - `?size=30000` would have sharp
			// allocate a ~3.6GB buffer, and this route is public.
			const size = Number(sizeParam);
			if (!Number.isInteger(size) || size < 1 || size > MAX_IMAGE_SIZE) {
				throw error(400, 'Invalid size parameter');
			}
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
