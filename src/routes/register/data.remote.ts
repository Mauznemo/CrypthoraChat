import { form, getRequestEvent } from '$app/server';
import { createSession, createUser } from '$lib/auth';
import { db } from '$lib/db';
import { collectErrorMessagesString, RegisterSchema } from '$lib/validation';
import { error, redirect } from '@sveltejs/kit';
import * as v from 'valibot';

export const register = form(async (data) => {
	// Check the user is logged in
	const username = data.get('username');
	const password = data.get('password');
	const confirmPassword = data.get('confirm-password');

	const input = {
		username: typeof username === 'string' ? username : '', // Fallback to empty string if not string (Valibot will catch it)
		password: typeof password === 'string' ? password : '',
		confirmPassword: typeof confirmPassword === 'string' ? confirmPassword : ''
	};

	// Validate against the schema
	const result = v.safeParse(RegisterSchema, input);

	if (!result.success) {
		let errorMessage = collectErrorMessagesString(result.issues);

		error(400, errorMessage);
	}

	const settings = await db.serverSettings.upsert({
		where: { id: 'singleton' },
		create: { id: 'singleton' },
		update: {}
	});

	if (
		settings.allowedUsernames.length == 0 ||
		!settings.allowedUsernames.includes(result.output.username)
	) {
		const userCount = await db.user.count();

		if (userCount > 0) {
			error(400, 'Username not allowed (Please contact an admin)');
		}
	}

	try {
		const user = await createUser(result.output.username, result.output.password);
		const session = await createSession(user.id);

		const { cookies } = getRequestEvent();

		cookies.set('session', session.id, {
			path: '/',
			httpOnly: true,
			secure: false, // Set to true in production with HTTPS
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 360 // 30 days
		});
	} catch (err: any) {
		if (err.code === 'P2002') {
			error(400, 'Username already taken');
		}
		console.error('Registration error:', err);
		error(500, 'Something went wrong. Please try again.');
	}

	redirect(302, '/chat');
});
