import { command, getRequestEvent } from '$app/server';
import { db } from '$lib/db';
import { assertOwnedUpload } from '$lib/server/fileUpload';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';

export const saveUserSticker = command(v.string(), async (path: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const stickerPath = assertOwnedUpload(path, locals.user!.id, 'sticker');
	if (!stickerPath) {
		error(403, 'Forbidden');
	}

	await db.userSticker.create({
		data: {
			userId: locals.user!.id,
			stickerPath
		}
	});
});
