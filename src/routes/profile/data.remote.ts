import { command, getRequestEvent } from '$app/server';
import { deleteSession, hashPassword, verifyPassword } from '$lib/auth';
import { db } from '$lib/db';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';

export const logout = command(async () => {
	const { cookies, locals } = getRequestEvent();
	if (locals.sessionId) {
		await deleteSession(locals.sessionId);
		locals.user = undefined;
		locals.sessionId = undefined;
	}

	cookies.delete('session', { path: '/' });
});

export const updateDisplayName = command(v.string(), async (displayName: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	await db.user.update({
		where: { id: locals.user!.id },
		data: { displayName }
	});
});

const changePasswordSchema = v.pipe(
	v.object({
		currentPassword: v.pipe(
			v.string('current required'),
			v.minLength(6, 'Current Password must be at least 6 characters'),
			v.maxLength(128, 'Current Password must be less than 128 characters')
		),
		newPassword: v.pipe(
			v.string('New Password is required'),
			v.minLength(6, 'New Password must be at least 6 characters'),
			v.maxLength(128, 'New Password must be less than 128 characters')
		),
		confirmNewPassword: v.pipe(
			v.string('Confirm new Password is required'),
			v.minLength(6, 'Confirm new Password must be at least 6 characters'),
			v.maxLength(128, 'Confirm new Password must be less than 128 characters')
		)
	}),
	v.check((input) => input.newPassword === input.confirmNewPassword, 'Passwords do not match')
);

export const changePassword = command(
	changePasswordSchema,
	async ({ currentPassword, newPassword, confirmNewPassword }) => {
		const { locals } = getRequestEvent();

		if (!locals.sessionId) {
			error(401, 'Unauthorized');
		}

		const user = await db.user.findUnique({
			where: { id: locals.user!.id },
			select: { password: true }
		});

		if (!user) {
			error(404, 'User not found');
		}

		const isValid = await verifyPassword(currentPassword, user.password);

		if (!isValid) {
			error(400, 'Current password is incorrect');
		}

		await db.user.update({
			where: { id: locals.user!.id },
			data: { password: await hashPassword(newPassword) }
		});

		await db.session.deleteMany({
			where: {
				userId: locals.user!.id,
				NOT: {
					id: locals.sessionId
				}
			}
		});
	}
);
