import { form, getRequestEvent } from '$app/server';
import { getServerTranslator } from '$lib/i18n/server';
import { createSession, validateUser } from '$lib/utils/auth';
import { collectErrorMessagesString, LoginSchema } from '$lib/utils/validation';
import { error, redirect } from '@sveltejs/kit';
import * as v from 'valibot';

export const login = form(LoginSchema, async (data) => {
	const { locals, cookies } = getRequestEvent();

	console.log('locale', locals.locale);

	const t = await getServerTranslator(locals.locale || 'en');

	const user = await validateUser(data.username, data.password);

	if (!user) {
		error(400, t('login.server.invalid-credentials'));
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
