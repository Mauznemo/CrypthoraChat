import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { db } from '../db';
import type { User } from '$prisma';

/**
 * How long a session lives, in the DB and in the cookie alike.
 *
 * Exported so the login and register handlers set the cookie from the same number - they used to
 * carry their own (longer) maxAge, so a cookie could outlive the row it pointed at, or vice versa.
 */
export const SESSION_LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;
export const SESSION_LIFETIME_SECONDS = SESSION_LIFETIME_MS / 1000;

/** Renew once the session is within this of expiring, so active users are never signed out. */
const SESSION_RENEW_WITHIN_MS = 15 * 24 * 60 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return bcrypt.compare(password, hash);
}

export async function createUser(username: string, password: string) {
	const hashedPassword = await hashPassword(password);

	const userCount = await db.user.count();

	return db.user.create({
		data: {
			displayName: username,
			username,
			password: hashedPassword,
			isAdmin: userCount === 0 // First user becomes admin
		}
	});
}

export async function validateUser(username: string, password: string): Promise<User | null> {
	const user = await db.user.findUnique({
		where: { username }
	});

	if (!user) return null;

	const isValid = await verifyPassword(password, user.password);
	return isValid ? user : null;
}

export async function createSession(userId: string, deviceOs: string) {
	// The session id is the bearer credential for the whole account, so it is generated here
	// rather than left to the schema's cuid() default. cuid is collision-resistant, not
	// unguessable: it is mostly a timestamp, a per-process counter and a host fingerprint.
	const id = randomBytes(32).toString('base64url');
	const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

	return db.session.create({
		data: {
			id,
			userId,
			expiresAt,
			deviceOs
		}
	});
}

export async function validateSession(sessionId: string) {
	const session = await db.session.findUnique({
		where: { id: sessionId },
		include: { user: true }
	});

	const now = new Date();
	let renewed = false;

	// Check if session exists and is not expired
	if (!session || session.expiresAt < now) {
		if (session) {
			await db.session.delete({ where: { id: sessionId } });
		}
		return null;
	}

	const timeUntilExpiry = session.expiresAt.getTime() - now.getTime();

	if (timeUntilExpiry <= SESSION_RENEW_WITHIN_MS) {
		const newExpiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

		await db.session.update({
			where: { id: sessionId },
			data: { expiresAt: newExpiresAt }
		});

		session.expiresAt = newExpiresAt;
		// Flagged so the request hook can re-set the cookie. Without it the cookie, fixed at login,
		// expires while the row it points at keeps renewing - and the user is signed out anyway.
		renewed = true;
	}

	return Object.assign(session, { renewed });
}

export async function deleteSession(sessionId: string) {
	await db.session.delete({ where: { id: sessionId } });

	try {
		await db.notificationSubscription.deleteMany({ where: { sessionId } });
	} catch (e) {}
}

// Helper function to format validation errors
export function formatValidationErrors(issues: any[]) {
	const errors: Record<string, string> = {};

	for (const issue of issues) {
		const path = issue.path?.[0]?.key || 'form';
		errors[path] = issue.message;
	}

	return errors;
}
