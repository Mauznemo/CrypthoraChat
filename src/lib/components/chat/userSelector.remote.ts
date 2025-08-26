import { getRequestEvent, query } from '$app/server';
import { db } from '$lib/db';
import { safeUserFields } from '$lib/types';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';

export const getUsers = query(async () => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const users = await db.user.findMany({
		select: safeUserFields
	});
	return users;
});

export const findUsers = query(v.string(), async (username: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const users = await db.user.findMany({
		where: { username: { contains: username, mode: 'insensitive' } },
		select: safeUserFields,
		take: 10
	});
	return users;
});
