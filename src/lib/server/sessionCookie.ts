import { SESSION_LIFETIME_SECONDS } from '$lib/utils/auth';
import type { Cookies } from '@sveltejs/kit';

/**
 * Sets the session cookie.
 *
 * Shared by login and register so they cannot drift: login used to hardcode `secure: false` with
 * a "set to true in production" comment, which meant every login over plain HTTP put the session
 * credential on the wire in the clear.
 */
export function setSessionCookie(cookies: Cookies, sessionId: string): void {
	cookies.set('session', sessionId, {
		path: '/',
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax',
		maxAge: SESSION_LIFETIME_SECONDS
	});
}
