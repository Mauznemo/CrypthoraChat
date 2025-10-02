import { command, getRequestEvent, query } from '$app/server';
import { db } from '$lib/db';
import { removeFile } from '$lib/server/fileUpload';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';

export const getUserStickers = query(async () => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const userStickers = await db.user.findUnique({
		where: {
			id: locals.user!.id
		},
		select: {
			stickers: {
				select: {
					id: true,
					stickerPath: true,
					favorited: true
				}
			}
		}
	});

	if (!userStickers) {
		error(404, 'User not found');
	}

	return userStickers.stickers;
});

export const deleteUserSticker = command(v.string(), async (id: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	try {
		const userSticker = await db.userSticker.findUnique({
			where: {
				id
			}
		});

		if (!userSticker) {
			error(404, 'User sticker not found');
		}

		await removeFile(userSticker.stickerPath);

		await db.userSticker.delete({
			where: {
				id
			}
		});
	} catch (e) {
		console.error('Failed to remove sticker:', e);
		error(500, 'Failed to remove sticker');
	}
});

export const favoriteUserSticker = command(v.string(), async (id: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	await db.userSticker.update({
		where: {
			id
		},
		data: {
			favorited: true
		}
	});
});

export const unfavoriteUserSticker = command(v.string(), async (id: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	await db.userSticker.update({
		where: {
			id
		},
		data: {
			favorited: false
		}
	});
});
