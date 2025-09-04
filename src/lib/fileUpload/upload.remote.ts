import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { command, getRequestEvent } from '$app/server';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

async function ensureUploadDir() {
	try {
		await fs.access(UPLOAD_DIR);
	} catch {
		await fs.mkdir(UPLOAD_DIR, { recursive: true });
	}
}

export const uploadEncryptedFile = command(
	v.object({ encryptedFileNameBase64: v.string(), encryptedDataBase64: v.string() }),
	async ({ encryptedFileNameBase64, encryptedDataBase64 }) => {
		const { locals } = getRequestEvent();

		if (!locals.sessionId) {
			error(401, 'Unauthorized');
		}

		try {
			await ensureUploadDir();

			const binary = Uint8Array.from(atob(encryptedDataBase64), (c) => c.charCodeAt(0));
			const buffer = Buffer.from(binary);

			const filename = randomUUID() + '_' + encryptedFileNameBase64 + '.enc';
			const filePath = path.join(UPLOAD_DIR, filename);
			await fs.writeFile(filePath, buffer);
		} catch (e) {
			error(500, 'Failed to save file: ' + e);
		}
	}
);
