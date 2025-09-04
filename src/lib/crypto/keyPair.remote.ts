import { command, getRequestEvent, query } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/db';
import { error } from '@sveltejs/kit';

export const getUserKeyPair = query(async () => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	try {
		const keyPair = await db.keyPair.findUnique({
			where: {
				userId: locals.user!.id
			}
		});

		if (!keyPair) {
			error(404, 'Not found');
		}

		return keyPair;
	} catch (e) {
		error(404, 'Not found');
	}
});

export const createUserKeyPair = command(
	v.object({ encryptedPrivateKeyBase64: v.string(), publicKeyBase64: v.string() }),
	async ({ encryptedPrivateKeyBase64, publicKeyBase64 }) => {
		const { locals } = getRequestEvent();

		if (!locals.sessionId) {
			error(401, 'Unauthorized');
		}

		const keyPairExists = await db.keyPair.findUnique({
			where: {
				userId: locals.user!.id
			}
		});

		if (keyPairExists) {
			error(400, 'Key pair already exists');
		}

		try {
			await db.keyPair.create({
				data: {
					encryptedPrivateKey: encryptedPrivateKeyBase64,
					publicKey: publicKeyBase64,
					userId: locals.user!.id
				}
			});
		} catch (e) {
			error(500, 'Something went wrong');
		}
	}
);

export const getUserPublicKey = query(v.string(), async (userId: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	try {
		const keyPair = await db.keyPair.findUnique({
			where: {
				userId: userId
			}
		});

		if (!keyPair) {
			error(404, 'Not found');
		}

		return keyPair.publicKey;
	} catch (e) {
		error(404, 'Not found');
	}
});
