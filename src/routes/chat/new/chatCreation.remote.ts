import { command, getRequestEvent } from '$app/server';
import { db } from '$lib/db';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';

const createGroupSchema = v.object({
	groupName: v.pipe(
		v.string('Group name is required'),
		v.minLength(3, 'Group name must be at least 3 characters')
	),

	userIds: v.pipe(
		v.array(v.string(), 'You must provide a list of users.'),
		v.minLength(1, 'You must select at least one user.')
	),

	encryptedUserChatKeys: v.record(v.string(), v.string())
});

export const createGroup = command(
	createGroupSchema,
	async ({ groupName, userIds, encryptedUserChatKeys }) => {
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

		const allParticipantIds = [...new Set([...userIds, locals.user!.id])];

		const chat = await db.chat.create({
			data: {
				name: groupName,
				type: 'group',
				ownerId: locals.user!.id,
				participants: {
					connect: allParticipantIds.map((id) => ({ id }))
				},
				publicUserChatKeys: {
					create: Object.entries(encryptedUserChatKeys).map(([userId, encryptedChatKey]) => ({
						userId,
						encryptedKey: encryptedChatKey
					}))
				}
			}
		});

		return { success: true, chatId: chat.id };
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
					id: {
						in: [userId, locals.user!.id]
					}
				}
			},
			// Ensure it's exactly 2 participants (just these two users)
			AND: [
				{
					participants: {
						some: {
							id: userId
						}
					}
				},
				{
					participants: {
						some: {
							id: locals.user!.id
						}
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

	const allParticipantIds = [...new Set([userId, locals.user!.id])];

	const chat = await db.chat.create({
		data: {
			name: userId,
			type: 'dm',
			ownerId: locals.user!.id,
			participants: {
				connect: allParticipantIds.map((id) => ({ id }))
			},
			publicUserChatKeys: {
				create: {
					userId: userId,
					encryptedKey: encryptedChatKey
				}
			}
		}
	});

	return { success: true, chatId: chat.id };
});
