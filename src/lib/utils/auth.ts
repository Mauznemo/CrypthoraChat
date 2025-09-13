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

export async function createSession(userId: string) {
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + 360); // 360 days

	return db.session.create({
		data: {
			userId,
			expiresAt
		}
	});
}

export async function validateSession(sessionId: string) {
	const session = await db.session.findUnique({
		where: { id: sessionId },
		include: { user: true }
	});

	if (!session || session.expiresAt < new Date()) {
		if (session) {
			await db.session.delete({ where: { id: sessionId } });
		}

		return null;
	}

	return session;
}

export async function deleteSession(sessionId: string) {
	await db.session.delete({ where: { id: sessionId } });
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
