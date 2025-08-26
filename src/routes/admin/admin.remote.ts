import { command, getRequestEvent, query } from '$app/server';
import { db } from '$lib/db';
import { error } from '@sveltejs/kit';

import * as v from 'valibot';

export const getUsers = query(async () => {
	const { locals } = getRequestEvent();

	if (!locals.user?.isAdmin) {
		error(401, 'Unauthorized');
	}

	const users = await db.user.findMany();
	return users;
});

export const deleteUser = command(v.string(), async (userId: string) => {
	const { locals } = getRequestEvent();

	if (!locals.user?.isAdmin) {
		error(401, 'Unauthorized');
	}

	// Does not work at the moment since it would require cascading deletes (all messages by that user)
	await db.user.delete({
		where: { id: userId }
	});
});

export const getAvailableUsernames = query(async () => {
	const { locals } = getRequestEvent();

	if (!locals.user?.isAdmin) {
		error(401, 'Unauthorized');
	}

	const settings = await db.serverSettings.upsert({
		where: { id: 'singleton' },
		create: { id: 'singleton' },
		update: {}
	});

	return settings.allowedUsernames;
});

export const removeUsername = command(v.string(), async (username: string) => {
	const { locals } = getRequestEvent();

	if (!locals.user?.isAdmin) {
		error(401, 'Unauthorized');
	}

	const settings = await db.serverSettings.upsert({
		where: { id: 'singleton' },
		create: { id: 'singleton' },
		update: {}
	});

	settings.allowedUsernames = settings.allowedUsernames.filter((name) => name !== username);
	await db.serverSettings.update({
		where: { id: 'singleton' },
		data: { allowedUsernames: settings.allowedUsernames }
	});

	return settings.allowedUsernames;
});

export const addUsername = command(v.string(), async (username: string) => {
	const { locals } = getRequestEvent();

	if (!locals.user?.isAdmin) {
		error(401, 'Unauthorized');
	}

	const settings = await db.serverSettings.upsert({
		where: { id: 'singleton' },
		create: { id: 'singleton' },
		update: {}
	});

	settings.allowedUsernames.push(username);
	await db.serverSettings.update({
		where: { id: 'singleton' },
		data: { allowedUsernames: settings.allowedUsernames }
	});

	return settings.allowedUsernames;
});
