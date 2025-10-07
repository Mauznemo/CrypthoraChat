import { form, getRequestEvent } from '$app/server';
import { createSession, validateUser } from '$lib/utils/auth';
import { LoginSchema } from '$lib/utils/validation';
import { error, redirect } from '@sveltejs/kit';

export const login = form(LoginSchema, async (data) => {
	const { cookies } = getRequestEvent();

	const user = await validateUser(data.username, data.password);

	if (!user) {
		error(400, 'login.server.invalid-credentials');
	}

	const session = await createSession(user.id, data.deviceOs);

	cookies.set('session', session.id, {
		path: '/',
		httpOnly: true,
		secure: false, // Set to true in production with HTTPS
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 360
	});

	redirect(303, '/chat');
});
