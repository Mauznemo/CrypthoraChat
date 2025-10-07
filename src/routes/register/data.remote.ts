import { form, getRequestEvent } from '$app/server';
import { createSession, createUser } from '$lib/utils/auth';
import { db } from '$lib/db';
import { RegisterSchema } from '$lib/utils/validation';
import { error } from '@sveltejs/kit';

export const register = form(RegisterSchema, async (data) => {
	const settings = await db.serverSettings.upsert({
		where: { id: 'singleton' },
		create: { id: 'singleton' },
		update: {}
	});

	if (settings.allowedUsernames.length == 0 || !settings.allowedUsernames.includes(data.username)) {
		const userCount = await db.user.count();

		if (userCount > 0) {
			error(400, 'login.server.username-not-allowed');
		}
	}

	try {
		const user = await createUser(data.username, data.password);
		const session = await createSession(user.id, data.deviceOs);

		const { cookies } = getRequestEvent();

		cookies.set('session', session.id, {
			path: '/',
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 360
		});
	} catch (err: any) {
		if (err.code === 'P2002') {
			error(400, 'login.server.username-taken');
		}
		console.error('Registration error:', err);
		error(500, 'login.server.something-went-wrong');
	}
});
