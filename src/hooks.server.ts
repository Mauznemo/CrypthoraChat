import type { Handle, HandleValidationError } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { setSessionCookie } from '$lib/server/sessionCookie';
import { validateSession } from '$lib/utils/auth';

// Routes that don't require authentication
const PUBLIC_ROUTES = [
	'/',
	'/login',
	'/register',
	'/api/profile-picture',
	// The wrapper app reads this before the user has logged in
	'/api/push-config'
];

const ADMIN_ROUTES = ['/admin'];

/**
 * The one route allowed to evaluate strings as JavaScript.
 *
 * @imgly/background-removal depends on `ndarray`, which compiles its view constructors with
 * `new Function`. That is baked into the dependency, there is no flag for it and 1.7.0 is the
 * latest release, so the choice is between dropping background removal and allowing eval.
 *
 * Scoped to this route rather than added to the global policy because the sticker editor renders
 * only images the user picked locally - no message content, no other user's data - so the stored
 * XSS surface the CSP is really defending never reaches it. `script-src 'self'` still holds here,
 * so an attacker would already need script execution on this page for eval to buy them anything.
 */
const EVAL_ROUTES = ['/sticker-editor'];

function isPublicRoute(pathname: string): boolean {
	return PUBLIC_ROUTES.some((route) => {
		if (route === '/') return pathname === '/';
		return pathname.startsWith(route);
	});
}

function isAdminRoute(pathname: string): boolean {
	return ADMIN_ROUTES.some((route) => {
		if (route === '/') return pathname === '/';
		return pathname.startsWith(route);
	});
}

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get('session');

	const headerLocale = event.request.headers.get('accept-language')?.split(',')[0]?.split('-')[0];
	const locale = headerLocale || 'en';
	event.locals.locale = locale;

	// Validate session if it exists
	if (sessionId) {
		const session = await validateSession(sessionId);
		if (session) {
			event.locals.user = session.user;
			event.locals.sessionId = sessionId;
			if (session.renewed) {
				setSessionCookie(event.cookies, sessionId);
			}
		} else {
			event.cookies.delete('session', { path: '/' });
		}
	}

	// Protect routes - redirect to login if not authenticated
	if (!isPublicRoute(event.url.pathname) && !event.locals.user) {
		throw redirect(302, `/login?redirect=${encodeURIComponent(event.url.pathname)}`);
	}

	if (isAdminRoute(event.url.pathname) && !event.locals.user?.isAdmin) {
		throw redirect(302, '/profile');
	}

	const response = await resolve(event);

	if (EVAL_ROUTES.some((route) => event.url.pathname.startsWith(route))) {
		allowEval(response);
	}

	// Baseline hardening. Not a substitute for escaping or authorization, but it costs nothing and
	// takes MIME sniffing, framing and referrer leakage off the table.
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	if (process.env.NODE_ENV === 'production') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	return response;
};

/**
 * Appends 'unsafe-eval' to the script-src of the policy SvelteKit already generated.
 *
 * Done by rewriting the header rather than by loosening `kit.csp`, so the rest of the app keeps
 * the strict policy and SvelteKit's own nonce survives untouched - unlike 'unsafe-inline', a
 * nonce does not cause 'unsafe-eval' to be ignored.
 */
function allowEval(response: Response): void {
	const csp = response.headers.get('content-security-policy');
	if (!csp || csp.includes("'unsafe-eval'")) return;

	response.headers.set(
		'content-security-policy',
		csp.replace(/script-src ([^;]*)/, "script-src $1 'unsafe-eval'")
	);
}

export const handleValidationError: HandleValidationError = async ({ issues }) => {
	const messages = (issues as any[]).map((issue: any) => {
		//const dot = v.getDotPath(issue as any);
		const text = issue?.message ?? 'Invalid value';
		return text;
		//return dot ? `${dot}: ${text}` : text;
	});

	const unique = Array.from(new Set(messages));
	const joined = unique.join(', ');
	return {
		message: joined
	} as unknown as App.Error;
};
