import { command, getRequestEvent, query } from '$app/server';
import { db } from '$lib/db';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';

export const saveEncryptedKey = command(v.string(), async (encryptedKeyBase64: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	try {
		await db.user.update({
			where: {
				id: locals.user!.id
			},
			data: {
				encryptedKey: encryptedKeyBase64
			}
		});
	} catch (e) {
		error(500, 'Failed to save encrypted key');
	}
});

export const removeEncryptedKey = command(async () => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	try {
		await db.user.update({
			where: {
				id: locals.user!.id
			},
			data: {
				encryptedKey: null
			}
		});
	} catch (e) {
		error(500, 'Failed to remove encrypted key');
	}
});

export const getEncryptedKey = query(async () => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	try {
		const user = await db.user.findUnique({
			where: {
				id: locals.user!.id
			},
			select: {
				encryptedKey: true
			}
		});

		return user?.encryptedKey || null;
	} catch (e) {
		error(500, 'Failed to get encrypted key');
	}
});
