import { command, getRequestEvent, query } from '$app/server';
import { db } from '$lib/db';
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
