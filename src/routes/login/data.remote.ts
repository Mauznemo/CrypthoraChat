import { form, getRequestEvent } from '$app/server';
import { createSession, validateUser } from '$lib/auth';
import { collectErrorMessagesString, LoginSchema } from '$lib/validation';
import { error, redirect } from '@sveltejs/kit';
import * as v from 'valibot';

export const login = form(async (data) => {
	// Check the user is logged in
	const username = data.get('username');
	const password = data.get('password');

	const input = {
		username: typeof username === 'string' ? username : '',
		password: typeof password === 'string' ? password : ''
	};

	// Validate against the schema
	const result = v.safeParse(LoginSchema, input);

	if (!result.success) {
		let errorMessage = collectErrorMessagesString(result.issues);

		error(400, errorMessage);
	}

	const user = await validateUser(result.output.username, result.output.password);

	if (!user) {
		error(400, 'Invalid username or password');
	}

	const session = await createSession(user.id);

	const { cookies } = getRequestEvent();

	cookies.set('session', session.id, {
		path: '/',
		httpOnly: true,
		secure: false, // Set to true in production with HTTPS
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 360 // 30 days
	});

	redirect(303, '/chat');
});
