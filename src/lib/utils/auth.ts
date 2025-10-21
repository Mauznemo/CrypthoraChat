import bcrypt from 'bcryptjs';
import { db } from '../db';
import type { User } from '$prisma';

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
	const expiresAt = new Date();
	expiresAt.setMonth(expiresAt.getMonth() + 6); // 6 months expiration

	return db.session.create({
		data: {
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

	// Check if session exists and is not expired
	if (!session || session.expiresAt < now) {
		if (session) {
			await db.session.delete({ where: { id: sessionId } });
		}
		return null;
	}

	// Calculate the time difference in milliseconds
	const timeUntilExpiry = session.expiresAt.getTime() - now.getTime();
	const halfMonthInMs = 15 * 24 * 60 * 60 * 1000; // 15 days in milliseconds

	if (timeUntilExpiry <= halfMonthInMs) {
		const newExpiresAt = new Date();
		newExpiresAt.setMonth(newExpiresAt.getMonth() + 6); // Renew for another 6 months

		await db.session.update({
			where: { id: sessionId },
			data: { expiresAt: newExpiresAt }
		});

		session.expiresAt = newExpiresAt;
	}

	return session;
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
