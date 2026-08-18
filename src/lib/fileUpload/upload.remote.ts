import { command, getRequestEvent, query } from '$app/server';
import { promises as fs } from 'node:fs';
import { fileExists, validateAttachmentPath } from '$lib/server/fileUpload';
import { error } from '@sveltejs/kit';
import path from 'path';
import { removeFile as removeFileFromServer } from '$lib/server/fileUpload';
import * as v from 'valibot';

/**
 * Resolves a client-supplied path and asserts it stays under the uploads root.
 *
 * Both handlers here take a raw path from the browser, so neither may touch the filesystem
 * before this has run - otherwise they become an arbitrary-unlink and an arbitrary-stat oracle
 * for anyone with an account.
 */
function resolveUploadPath(filePath: string): string {
	const validation = validateAttachmentPath(filePath);
	if (!validation.ok) {
		error(403, 'Forbidden');
	}
	return validation.absolute;
}

export const removeFile = command(v.string(), async (filePath: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const absPath = resolveUploadPath(filePath);

	if (!(await fileExists(absPath))) {
		error(404, 'File not found');
	}

	const { userId } = parseFilename(absPath);

	if (userId !== locals.user!.id) {
		error(403, 'Forbidden');
	}

	try {
		await removeFileFromServer(absPath);
	} catch {
		error(500, 'Failed to remove file');
	}
});

function parseFilename(filePath: string) {
	const filename = path.basename(filePath);

	const withoutExt = filename.replace(/\.enc$/, '');

	const [uuid, userId] = withoutExt.split('_');

	return { uuid, userId };
}

export const getFileSize = query(v.string(), async (filePath: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const absPath = resolveUploadPath(filePath);

	if (!(await fileExists(absPath))) {
		error(404, 'File not found');
	}

	try {
		const stats = await fs.stat(absPath);
		return stats.size;
	} catch (err) {
		console.error(err);
		return 0;
	}
});
