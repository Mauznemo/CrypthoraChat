import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { base64ToArrayBuffer } from '$lib/crypto/utils';

const UPLOAD_PATH = (process.env.UPLOAD_PATH || './uploads') + '/profiles';

async function ensureUploadDir() {
	try {
		await fs.access(UPLOAD_PATH);
	} catch {
		await fs.mkdir(UPLOAD_PATH, { recursive: true });
	}
}

let serverKeyPromise: Promise<CryptoKey> | null = null;
async function getServerKey(): Promise<CryptoKey> {
	if (!serverKeyPromise) {
		const rawKey = base64ToArrayBuffer(process.env.PROFILE_PIC_KEY!); //Uint8Array.from(atob(process.env.PROFILE_PIC_KEY!), (c) => c.charCodeAt(0));
		serverKeyPromise = crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, [
			'encrypt',
			'decrypt'
		]);
	}
	return serverKeyPromise;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.sessionId) {
		throw error(401, 'Unauthorized');
	}

	try {
		await ensureUploadDir();

		const formData = await request.formData();
		const file = formData.get('file');
		const fileExtension = (formData.get('fileExtension') as string) || 'png';

		if (!(file instanceof File)) {
			throw error(400, 'Invalid form data: missing file');
		}

		const arrayBuffer = await file.arrayBuffer();
		const bytes = new Uint8Array(arrayBuffer);

		const serverKey = await getServerKey();
		const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
		const encrypted = await globalThis.crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv },
			serverKey,
			bytes
		);

		const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
		combined.set(iv, 0);
		combined.set(new Uint8Array(encrypted), iv.byteLength);

		const filename = `${randomUUID()}.${fileExtension}.enc`;
		const filePath = path.join(UPLOAD_PATH, filename);
		await fs.writeFile(filePath, combined);

		const id = filename.replace('.enc', '');
		return new Response(JSON.stringify({ success: true, id, path: `/uploads/${filename}` }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (e: any) {
		console.error('upload-profile-picture error', e);
		throw error(500, 'Failed to save file: ' + (e?.message ?? e));
	}
};
