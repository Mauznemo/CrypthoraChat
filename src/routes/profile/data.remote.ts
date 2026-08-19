import { command, getRequestEvent } from '$app/server';
import { deleteSession, hashPassword, verifyPassword } from '$lib/utils/auth';
import { invalidateCachedUser } from '$lib/server/userCache';
import { MIN_PASSWORD_LENGTH } from '$lib/utils/validation';
import { db } from '$lib/db';
import { assertOwnedUpload, removeFile } from '$lib/server/fileUpload';
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

const displayNameSchema = v.pipe(
	v.string('Display name is required'),
	v.minLength(1, 'Display name is required'),
	v.maxLength(64, 'Display name must be less than 64 characters')
);

export const updateDisplayName = command(displayNameSchema, async (displayName: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	await db.user.update({
		where: { id: locals.user!.id },
		data: { displayName }
	});

	invalidateCachedUser(locals.user!.id);
});

export const updateProfilePicture = command(v.string(), async (filePath: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const profilePicPath = assertOwnedUpload(filePath, locals.user!.id, 'picture');
	if (!profilePicPath) {
		error(403, 'Forbidden');
	}

	const user = await db.user.findUnique({
		where: { id: locals.user!.id },
		select: { profilePicPath: true }
	});

	if (user?.profilePicPath) {
		await removeFile(user.profilePicPath);
	}

	await db.user.update({
		where: { id: locals.user!.id },
		data: { profilePicPath }
	});

	invalidateCachedUser(locals.user!.id);
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
