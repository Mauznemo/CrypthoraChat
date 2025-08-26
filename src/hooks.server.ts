import type { Handle, HandleValidationError } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { validateSession } from '$lib/auth.js';
import * as v from 'valibot';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/', '/login', '/register'];

const ADMIN_ROUTES = ['/admin'];

// Check if a route is public
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

	// Validate session if it exists
	if (sessionId) {
		const session = await validateSession(sessionId);
		if (session) {
			event.locals.user = session.user;
			event.locals.sessionId = sessionId;
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

	return resolve(event);
};

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
