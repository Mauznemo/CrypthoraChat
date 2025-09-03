import { command, getRequestEvent } from '$app/server';
import { deleteSession } from '$lib/auth';
import { db } from '$lib/db';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';

export const logout = command(async () => {
	const { cookies, locals } = getRequestEvent();
	if (locals.sessionId) {
		await deleteSession(locals.sessionId);
		locals.user = undefined;
		locals.sessionId = undefined;
	}

	cookies.delete('session', { path: '/' });
});

export const updateDisplayName = command(v.string(), async (displayName: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	await db.user.update({
		where: { id: locals.user!.id },
		data: { displayName }
	});
});
