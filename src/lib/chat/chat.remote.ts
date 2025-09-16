import { command, getRequestEvent, query } from '$app/server';
import { db } from '$lib/db';
import { removeFile } from '$lib/server/fileUpload';
import { sendEventToChat, sendSystemMessage } from '$lib/server/socketCommands';
import {
	chatWithoutMessagesFields,
	safeUserFields,
	type ChatParticipant,
	type SafeUser
} from '$lib/types';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';

// Simple in-memory cache - might want to use Redis or another cache in production
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const getUserById = query(v.string(), async (userId) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const cached = userCache.get(userId);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return cached.user;
	}

	const user = await db.user.findUnique({
		where: { id: userId },
		select: safeUserFields
	});

	if (!user) {
		error(404, 'User not found');
	}

	userCache.set(userId, {
		user,
		timestamp: Date.now()
	});

	return user;
});

export const getMessagesByChatId = query(
	v.object({
		chatId: v.string(),
		limit: v.optional(v.number()),
		cursor: v.optional(v.string()),
		systemCursor: v.optional(v.string()),
		direction: v.optional(v.union([v.literal('newer'), v.literal('older')]))
	}),
	async ({ chatId, limit = 50, cursor, systemCursor, direction = 'newer' }) => {
		const { locals } = getRequestEvent();

		if (!locals.sessionId) {
			error(401, 'Unauthorized');
		}

		const participant = await db.chatParticipant.findUnique({
			where: {
				chatId_userId: { chatId, userId: locals.user!.id }
			},
			select: { joinKeyVersion: true }
		});

		if (!participant) {
			error(403, 'You are not a participant of this chat');
		}

		// Build where clause for regular messages
		let messageWhereClause: any = {
			chatId,
			usedKeyVersion: { gte: participant.joinKeyVersion }
		};

		console.log(
			'querying',
			limit,
			'system messages with cursor',
			systemCursor,
			'and direction',
			direction
		);

		if (cursor) {
			const cursorMessage = await db.message.findUnique({
				where: { id: cursor },
				select: { timestamp: true }
			});

			if (cursorMessage) {
				messageWhereClause.timestamp =
					direction === 'newer' ? { gt: cursorMessage.timestamp } : { lt: cursorMessage.timestamp };
			}
		}

		// Build where clause for system messages
		let systemWhereClause: any = {
			chatId,
			usedKeyVersion: { gte: participant.joinKeyVersion }
		};

		if (systemCursor) {
			const cursorSystemMessage = await db.systemMessage.findUnique({
				where: { id: systemCursor },
				select: { timestamp: true }
			});

			if (cursorSystemMessage) {
				systemWhereClause.timestamp =
					direction === 'newer'
						? { gt: cursorSystemMessage.timestamp }
						: { lt: cursorSystemMessage.timestamp };
			}
		}

		const messages = await db.message.findMany({
			where: messageWhereClause,
			orderBy: { timestamp: direction === 'newer' ? 'asc' : 'desc' },
			take: limit,
			include: {
				user: { select: safeUserFields },
				chat: true,
				readBy: { select: safeUserFields },
				replyTo: { include: { user: { select: safeUserFields } } }
			}
		});

		const systemMessages = await db.systemMessage.findMany({
			where: systemWhereClause,
			orderBy: { timestamp: direction === 'newer' ? 'asc' : 'desc' },
			take: limit
		});

		if (direction === 'older') {
			messages.reverse();
			systemMessages.reverse();
		}

		console.log('Queried messages: ', messages.length);
		console.log('Queried system messages: ', systemMessages.length);

		return {
			messages,
			systemMessages,
			hasMore: messages.length === limit,
			hasMoreSystemMessages: systemMessages.length === limit,
			nextCursor: messages.length > 0 ? messages[messages.length - 1].id : cursor || null,
			prevCursor: messages.length > 0 ? messages[0].id : cursor || null,
			nextSystemCursor:
				systemMessages.length > 0
					? systemMessages[systemMessages.length - 1].id
					: systemCursor || null,
			prevSystemCursor: systemMessages.length > 0 ? systemMessages[0].id : systemCursor || null
		};
	}
);

export const getUserChats = query(async () => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const userWithChats = await db.user.findUnique({
		where: { id: locals.user!.id },
		select: {
			chatParticipations: {
				select: {
					chat: {
						select: chatWithoutMessagesFields
					}
				}
			}
		}
	});

	return userWithChats?.chatParticipations.map((participation) => participation.chat) ?? [];
});

const addUserToChatSchema = v.object({
	chatId: v.string(),
	userIds: v.pipe(
		v.array(v.string(), 'You must provide a list of users.'),
		v.minLength(1, 'You must select at least one user.')
	),

	encryptedUserChatKeys: v.record(v.string(), v.string())
});

export const addUserToChat = command(
	addUserToChatSchema,
	async ({ chatId, userIds, encryptedUserChatKeys }) => {
		const { locals } = getRequestEvent();

		if (!locals.sessionId) {
			error(401, 'Unauthorized');
		}

		const chat = await db.chat.findUnique({
			where: { id: chatId },
			select: { ownerId: true, currentKeyVersion: true, participants: { select: { userId: true } } }
		});

		if (!chat) {
			error(404, 'Chat not found');
		}

		if (chat.ownerId !== locals.user!.id) {
			error(403, 'You do not own this chat, please ask the owner to add new members.');
		}

		const newUsersCount = await db.user.findMany({
			where: {
				id: { in: userIds }
			}
		});

		if (newUsersCount.length !== userIds.length) {
			error(400, 'One or more of the selected users do not exist.');
		}

		if (chat.participants.some((participant) => userIds.includes(participant.userId))) {
			error(400, 'One or more of the selected users are already in the chat.');
		}

		try {
			const updatedChat = await db.chat.update({
				where: {
					id: chatId
				},
				data: {
					participants: {
						create: userIds.map((id) => ({
							user: { connect: { id } },
							joinKeyVersion: chat.currentKeyVersion
						}))
					},
					publicUserChatKeys: {
						create: Object.entries(encryptedUserChatKeys).map(([userId, encryptedChatKey]) => ({
							userId,
							encryptedKey: encryptedChatKey,
							keyVersion: chat.currentKeyVersion
						}))
					}
				},
				include: { participants: { include: { user: { select: safeUserFields } } } }
			});

			newUsersCount.forEach((user) => {
				sendSystemMessage(
					chatId,
					locals.user!.username + ' added @' + user.username + ' to the chat.'
				);

				sendEventToChat(chatId, 'chat-users-updated', {
					chatParticipant: updatedChat.participants.find(
						(p) => p.userId === user.id
					) as ChatParticipant,
					chatId,
					action: 'add'
				});
			});
		} catch (e) {
			console.error('Failed to add users to chat:', e);
			error(500, 'Failed to add users to chat');
		}
	}
);

export const leaveChat = command(v.string(), async (chatId: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const chat = await db.chat.findUnique({
		where: { id: chatId },
		select: { participants: { select: { userId: true } } }
	});

	if (!chat) {
		error(404, 'Chat not found');
	}

	if (!chat.participants.some((participant) => participant.userId === locals.user!.id)) {
		error(400, 'You are not in the chat.');
	}

	try {
		await db.userChatKey.delete({
			where: {
				userId_chatId: {
					userId: locals.user!.id,
					chatId
				}
			}
		});
	} catch (e) {
		// Ignore since the user might not have a key
		console.log('Failed to delete user chat key, might not exist');
	}

	try {
		await db.chatParticipant.delete({
			where: {
				chatId_userId: {
					chatId,
					userId: locals.user!.id
				}
			}
		});

		await db.publicUserChatKey.deleteMany({
			where: {
				chatId: chatId,
				userId: locals.user!.id
			}
		});

		sendSystemMessage(chatId, '@' + locals.user!.username + ' left the chat.');

		sendEventToChat(chatId, 'chat-users-updated', {
			user: locals.user! as SafeUser,
			chatId,
			action: 'remove'
		});
	} catch (e) {
		console.error('Failed to leave chat:', e);
		error(500, 'Failed to leave chat');
	}
});

export const getChatById = query(v.string(), async (chatId: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	//TODO: Check if the user is a member of the chat

	const chat = await db.chat.findUnique({
		where: { id: chatId },
		select: chatWithoutMessagesFields
	});

	return chat;
});

export const getCurrentChatKeyVersion = query(v.string(), async (chatId: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	try {
		const chat = await db.chat.findUnique({
			where: {
				id: chatId
			},
			select: {
				currentKeyVersion: true
			}
		});

		return chat?.currentKeyVersion;
	} catch (e) {
		console.log('Error getting chat key version:', e);
		error(404, 'Not found');
	}
});

const getEncryptedChatKeysSchema = v.object({ chatId: v.string(), keyVersion: v.number() });

export const getEncryptedChatKeys = query(getEncryptedChatKeysSchema, async ({ chatId }) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	try {
		const userChatKeys = await db.userChatKey.findUnique({
			where: {
				userId_chatId: {
					userId: locals.user!.id,
					chatId: chatId
				}
			},
			select: { keyVersions: { select: { encryptedKey: true, keyVersion: true } } }
		});

		return userChatKeys;
	} catch (e) {
		console.log('Error getting encrypted chat key:', e);
		error(404, 'Not found');
	}
});

const saveEncryptedChatKeySchema = v.object({
	chatId: v.string(),
	encryptedKey: v.string(),
	keyVersion: v.number()
});

export const saveEncryptedChatKey = command(
	saveEncryptedChatKeySchema,
	async ({ chatId, encryptedKey, keyVersion }) => {
		const { locals } = getRequestEvent();

		if (!locals.sessionId) {
			error(401, 'Unauthorized');
		}

		try {
			await db.userChatKey.upsert({
				where: {
					userId_chatId: {
						userId: locals.user!.id,
						chatId: chatId
					}
				},
				update: {},
				create: {
					userId: locals.user!.id,
					chatId: chatId
				}
			});

			const userChatKeyVersion = await db.userChatKeyVersion.upsert({
				where: {
					userId_chatId_keyVersion: {
						userId: locals.user!.id,
						chatId: chatId,
						keyVersion: keyVersion
					}
				},
				update: {
					encryptedKey: encryptedKey,
					keyVersion: keyVersion
				},
				create: {
					userId: locals.user!.id,
					chatId,
					keyVersion,
					encryptedKey: encryptedKey
				}
			});

			return userChatKeyVersion?.encryptedKey;
		} catch (e) {
			console.error('Failed to save encrypted chat key:', e);
			error(500, 'Something went wrong');
		}
	}
);

export const getPublicEncryptedChatKeys = query(v.string(), async (chatId: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	try {
		const publicEncryptedChatKeys = await db.publicUserChatKey.findMany({
			where: {
				userId: locals.user!.id,
				chatId: chatId
			},
			select: { encryptedKey: true, keyVersion: true },
			orderBy: { keyVersion: 'desc' }
		});
		return publicEncryptedChatKeys;
	} catch (e) {
		console.error('Failed to get public encrypted chat key:', e);
		error(404, 'Not found');
	}
});

export const removePublicEncryptedChatKeys = command(v.string(), async (chatId: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	try {
		await db.publicUserChatKey.deleteMany({
			where: {
				userId: locals.user!.id,
				chatId: chatId
			}
		});
	} catch (e) {
		console.error('Failed to remove public encrypted chat keys:', e);
		error(500, 'Failed to remove public encrypted chat keys');
	}
});

const updateGroupNameSchema = v.object({
	chatId: v.string(),
	groupName: v.pipe(
		v.string('Group name is required'),
		v.minLength(3, 'Group name must be at least 3 characters')
	)
});

export const updateGroupName = command(updateGroupNameSchema, async ({ chatId, groupName }) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const chat = await db.chat.findUnique({
		where: { id: chatId },
		select: { participants: { select: { userId: true } } }
	});

	const userInChat = chat?.participants.some(
		(participant) => participant.userId === locals.user!.id
	);

	if (!userInChat) {
		error(403, 'You are not a participant of this chat');
	}

	try {
		await db.chat.update({
			where: { id: chatId },
			data: { name: groupName }
		});

		await sendSystemMessage(
			chatId,
			`@${locals.user!.username} updated the group name to ${groupName}.`
		);
		await sendEventToChat(chatId, 'chat-updated', { chatId, newName: groupName });
	} catch (e) {
		console.error('Failed to update group name:', e);
		error(500, 'Failed to update group name');
	}
});

export const updateGroupImage = command(
	v.object({ chatId: v.string(), imagePath: v.string() }),
	async ({ chatId, imagePath }) => {
		const { locals } = getRequestEvent();

		if (!locals.sessionId) {
			error(401, 'Unauthorized');
		}

		const chat = await db.chat.findUnique({
			where: { id: chatId },
			select: { image: true, participants: { select: { userId: true } } }
		});

		if (!chat) {
			error(404, 'Chat not found');
		}

		const userInChat = chat?.participants.some(
			(participant) => participant.userId === locals.user!.id
		);

		if (!userInChat) {
			error(403, 'You are not a participant of this chat');
		}

		if (chat.image) {
			await removeFile(chat.image);
		}

		try {
			await db.chat.update({
				where: { id: chatId },
				data: { image: imagePath }
			});

			await sendSystemMessage(chatId, `@${locals.user!.username} updated the group image.`);

			await sendEventToChat(chatId, 'chat-updated', { chatId, newImagePath: imagePath });
		} catch (e) {
			console.error('Failed to update group image:', e);
			error(500, 'Failed to update group image');
		}
	}
);
