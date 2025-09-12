import { command, getRequestEvent } from '$app/server';
import { db } from '$lib/db';
import { fileExists } from '$lib/server/fileUpload';
import { error } from '@sveltejs/kit';
import path from 'path';
import { removeFile as removeFileFromServer } from '$lib/server/fileUpload';
import * as v from 'valibot';

export const removeFile = command(v.string(), async (filePath: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	if (!fileExists(filePath)) {
		error(404, 'File not found');
	}

	const { uuid, userId } = parseFilename(filePath);

	if (userId !== locals.user!.id) {
		error(403, 'Forbidden');
	}

	try {
		await removeFileFromServer(filePath);
	} catch (e) {
		error(500, 'Failed to remove file');
	}
});

function parseFilename(filePath: string) {
	const filename = path.basename(filePath);

	const withoutExt = filename.replace(/\.enc$/, '');

	const [uuid, userId, ...rest] = withoutExt.split('_');

	return { uuid, userId };
}
