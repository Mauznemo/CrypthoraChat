import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const UPLOAD_PATH = (process.env.UPLOAD_PATH || './uploads') + '/media';

async function ensureUploadDir() {
	try {
		await fs.access(UPLOAD_PATH);
	} catch {
		await fs.mkdir(UPLOAD_PATH, { recursive: true });
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.sessionId) {
		throw error(401, 'Unauthorized');
	}

	try {
		await ensureUploadDir();

		const formData = await request.formData();
		const encryptedData = formData.get('encryptedData');
		const encryptedFileNameBase64 = formData.get('encryptedFileNameBase64');

		if (!(encryptedData instanceof File) || typeof encryptedFileNameBase64 !== 'string') {
			throw error(400, 'Invalid form data');
		}

		const arrayBuffer = await encryptedData.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		const filename = `${randomUUID()}_${encryptedFileNameBase64}.enc`;
		const filePath = path.join(UPLOAD_PATH, filename);

		await fs.writeFile(filePath, buffer);

		return new Response(JSON.stringify({ success: true, filename }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (e: any) {
		console.error('upload error', e);
		throw error(500, 'Failed to save file: ' + (e?.message ?? e));
	}
};
