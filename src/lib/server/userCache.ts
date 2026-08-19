import type { SafeUser } from '$lib/types';

// Simple in-memory cache - might want to use Redis or another cache in production.
// Per-process, so it behaves differently the moment this is run as more than one instance.
const userCache = new Map<string, { user: SafeUser; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getCachedUser(userId: string): SafeUser | null {
	const cached = userCache.get(userId);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return cached.user;
	}
	return null;
}

export function setCachedUser(userId: string, user: SafeUser): void {
	userCache.set(userId, { user, timestamp: Date.now() });
	sweep();
}

/**
 * Drops a user's cached profile.
 *
 * Called after a display name or avatar change, which otherwise took up to CACHE_TTL to show up
 * for everyone else with no way to hurry it along.
 */
export function invalidateCachedUser(userId: string): void {
	userCache.delete(userId);
}

/** Without this the map grows with every distinct user ever looked up. */
function sweep(): void {
	const now = Date.now();
	for (const [id, entry] of userCache) {
		if (now - entry.timestamp >= CACHE_TTL) userCache.delete(id);
	}
}
