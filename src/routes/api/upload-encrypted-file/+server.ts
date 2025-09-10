import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureUploadDir } from '$lib/server/fileUpload';

const UPLOAD_BASE_PATH = (process.env.UPLOAD_PATH || './uploads') + '/media';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.sessionId) {
		throw error(401, 'Unauthorized');
	}

	const formData = await request.formData();
	const chatId = formData.get('chatId');
	const relativePath = `/${chatId}`;
	const encryptedData = formData.get('encryptedData');
	const encryptedFileNameBase64 = formData.get('encryptedFileNameBase64');

	if (
		!(encryptedData instanceof File) ||
		typeof encryptedFileNameBase64 !== 'string' ||
		typeof relativePath !== 'string'
	) {
		throw error(400, 'Invalid form data');
	}

	await ensureUploadDir(UPLOAD_BASE_PATH + relativePath);

	const arrayBuffer = await encryptedData.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	const filename = `${randomUUID()}_${encryptedFileNameBase64}.enc`;
	const filePath = path.join(UPLOAD_BASE_PATH + relativePath, filename);

	await fs.writeFile(filePath, buffer);

	try {
		return new Response(JSON.stringify({ success: true, filePath }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (e: any) {
		console.error('upload error', e);
		throw error(500, 'Failed to save file: ' + (e?.message ?? e));
	}
};
