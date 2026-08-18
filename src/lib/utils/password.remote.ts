import { command, getRequestEvent } from '$app/server';
import { db } from '$lib/db';
import { verifyPassword } from '$lib/utils/auth';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';

const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

/** Failed confirmations per user, so a wrong password cannot be brute forced through this command. */
const failedAttempts = new Map<string, { count: number; firstAt: number }>();

function checkThrottle(userId: string) {
	const entry = failedAttempts.get(userId);
	if (!entry) return;

	if (Date.now() - entry.firstAt > ATTEMPT_WINDOW_MS) {
		failedAttempts.delete(userId);
		return;
	}

	if (entry.count >= MAX_ATTEMPTS) {
		error(429, 'Too many failed attempts. Please try again later.');
	}
}

function registerFailedAttempt(userId: string) {
	const entry = failedAttempts.get(userId);
	if (!entry || Date.now() - entry.firstAt > ATTEMPT_WINDOW_MS) {
		failedAttempts.set(userId, { count: 1, firstAt: Date.now() });
		return;
	}
	entry.count++;
}

/**
 * Verifies the password of the logged in user. Used to gate destructive actions that cannot be
 * undone, like generating a new master key.
 */
export const confirmPassword = command(
	v.pipe(v.string(), v.maxLength(128)),
	async (password: string): Promise<void> => {
		const { locals } = getRequestEvent();

		if (!locals.sessionId || !locals.user) {
			error(401, 'Unauthorized');
		}

		checkThrottle(locals.user.id);

		const user = await db.user.findUnique({
			where: { id: locals.user.id },
			select: { password: true }
		});

		if (!user) {
			error(404, 'User not found');
		}

		if (!(await verifyPassword(password, user.password))) {
			registerFailedAttempt(locals.user.id);
			error(400, 'Incorrect password');
		}

		failedAttempts.delete(locals.user.id);
	}
);
