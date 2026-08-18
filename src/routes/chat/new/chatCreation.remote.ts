import { command, getRequestEvent } from '$app/server';
import { db } from '$lib/db';
import { assertOwnedUpload } from '$lib/server/fileUpload';
import { sendEventToUsersInChat } from '$lib/server/socketCommands';
import { safeUserFields } from '$lib/types';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';

const createGroupSchema = v.object({
	groupName: v.pipe(
		v.string('Group name is required'),
		v.minLength(3, 'Group name must be at least 3 characters'),
		v.maxLength(64, 'Group name must be less than 64 characters')
	),

	userIds: v.pipe(
		v.array(v.string(), 'You must provide a list of users.'),
		v.minLength(1, 'You must select at least one user.')
	),

	encryptedUserChatKeys: v.record(v.string(), v.string()),

	imagePath: v.optional(v.string())
});

export const createGroup = command(
	createGroupSchema,
	async ({ groupName, userIds, encryptedUserChatKeys, imagePath }) => {
		const { locals } = getRequestEvent();

		if (!locals.sessionId) {
			error(401, 'Unauthorized');
		}

		const existingUsersCount = await db.user.count({
			where: {
				id: { in: userIds }
			}
		});

		if (existingUsersCount !== userIds.length) {
			error(400, 'One or more of the selected users do not exist.');
		}

		const ownedImagePath = imagePath
			? assertOwnedUpload(imagePath, locals.user!.id, 'picture')
			: null;
		if (imagePath && !ownedImagePath) {
			error(403, 'Forbidden');
		}

		try {
			const allParticipantIds = [...new Set([...userIds, locals.user!.id])];

			const chat = await db.chat.create({
				data: {
					name: groupName,
					currentKeyVersion: 0,
					type: 'group',
					ownerId: locals.user!.id,
					imagePath: ownedImagePath,
					participants: {
						create: allParticipantIds.map((id) => ({
							user: { connect: { id } },
							joinKeyVersion: 0
						}))
					},
					publicUserChatKeys: {
						create: Object.entries(encryptedUserChatKeys).map(([userId, encryptedChatKey]) => ({
							userId,
							encryptedKey: encryptedChatKey,
							keyVersion: 0
						}))
					}
				}
			});

			// Emitted here rather than relayed by the creator's browser: the client used to
			// fire-and-forget this right before navigating away, so it was lost whenever its
			// socket was down. Includes the creator, which is how their other tabs find out.
			await sendEventToUsersInChat(chat.id, 'new-chat-created', { type: 'group' });

			return { success: true, chatId: chat.id };
		} catch (e) {
			console.error('Failed to create group:', e);
			error(500, 'Failed to create group');
		}
	}
);

const createDmSchema = v.object({
	userId: v.string('You must select a user.'),
	encryptedChatKey: v.string()
});

export const createDm = command(createDmSchema, async ({ userId, encryptedChatKey }) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const userExists =
		(await db.user.count({
			where: {
				id: userId
			}
		})) > 0;

	if (!userExists) {
		error(400, 'The selected user does not exist.');
	}

	// Check if DM already exists between these two users
	const existingDm = await db.chat.findFirst({
		where: {
			type: 'dm',
			participants: {
				every: {
					userId: { in: [userId, locals.user!.id] }
				}
			},
			AND: [
				{
					participants: {
						some: { userId: userId }
					}
				},
				{
					participants: {
						some: { userId: locals.user!.id }
					}
				}
			]
		},
		select: {
			id: true
		}
	});

	if (existingDm) {
		error(400, 'A DM with this user already exists.');
	}

	try {
		const allParticipantIds = [...new Set([userId, locals.user!.id])];

		const chat = await db.chat.create({
			data: {
				name: userId,
				currentKeyVersion: 0,
				type: 'dm',
				ownerId: locals.user!.id,
				participants: {
					create: allParticipantIds.map((id) => ({
						user: { connect: { id } },
						joinKeyVersion: 0
					}))
				},
				publicUserChatKeys: {
					create: {
						userId: userId,
						encryptedKey: encryptedChatKey,
						keyVersion: 0
					}
				}
			}
		});

		await sendEventToUsersInChat(chat.id, 'new-chat-created', { type: 'dm' });

		return { success: true, chatId: chat.id };
	} catch (e) {
		console.error('Failed to create DM:', e);
		error(500, 'Failed to create DM');
	}
});
