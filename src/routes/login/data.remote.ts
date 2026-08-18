import { form, getRequestEvent } from '$app/server';
import { RateLimiter } from '$lib/server/rateLimit';
import { setSessionCookie } from '$lib/server/sessionCookie';
import { createSession, validateUser } from '$lib/utils/auth';
import { LoginSchema } from '$lib/utils/validation';
import { error, redirect } from '@sveltejs/kit';

/**
 * Keyed by username rather than by IP: behind the reverse proxy this app is deployed with, every
 * request shares one address unless ADDRESS_HEADER is configured, so an IP bucket would lock the
 * whole household out at once. Per-username is also what actually caps password guessing.
 */
const loginLimiter = new RateLimiter(10, 10 * 60 * 1000);

export const login = form(LoginSchema, async (data) => {
	const { cookies } = getRequestEvent();

	const key = data.username.toLowerCase();

	if (loginLimiter.isLimited(key)) {
		error(429, 'login.server.too-many-attempts');
	}

	const user = await validateUser(data.username, data.password);

	if (!user) {
		loginLimiter.registerFailure(key);
		error(400, 'login.server.invalid-credentials');
	}

	loginLimiter.reset(key);

	const session = await createSession(user.id, data.deviceOs);

	setSessionCookie(cookies, session.id);

	redirect(303, '/chat');
});
