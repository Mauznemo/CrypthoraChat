import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { validateSession } from '$lib/auth.js';

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/register'
];

// Check if a route is public
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => {
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

  return resolve(event);
};