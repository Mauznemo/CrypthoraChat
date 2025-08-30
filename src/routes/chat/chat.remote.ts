import { command, getRequestEvent, query } from '$app/server';
import { db } from '$lib/db';
import { chatWithoutMessagesFields, safeUserFields, type MessageWithRelations } from '$lib/types';
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

export const getMessagesByChatId = query(v.string(), async (chatId) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const messages = await db.message.findMany({
		where: { chatId },
		orderBy: { timestamp: 'asc' },
		include: {
			user: { select: safeUserFields },
			chat: true,
			readBy: { select: safeUserFields },
			replyTo: { include: { user: { select: safeUserFields } } }
		}
	});

	if (messages.length === 0) {
		const chatExists = await db.chat.findUnique({
			where: { id: chatId },
			select: { id: true }
		});

		if (!chatExists) {
			error(404, 'Chat "' + chatId + '" not found');
		}
	}

	// Mark all messages as read // Can't mark the as read in case decryption fails and they weren't actually read
	// if (locals.user?.id) {
	// 	const messageIds = messages.map((message) => message.id);

	// 	await db.user.update({
	// 		where: { id: locals.user.id },
	// 		data: {
	// 			readMessages: {
	// 				connect: messageIds.map((id) => ({ id }))
	// 			}
	// 		}
	// 	});
	// }

	console.log('Queried messages: ', messages.length);

	return messages;
});

export const getUserChats = query(async () => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const userWithChats = await db.user.findUnique({
		where: { id: locals.user!.id },
		select: {
			chats: {
				select: chatWithoutMessagesFields
			}
		}
	});

	return userWithChats?.chats ?? [];
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

export const getEncryptedChatKeySeed = query(v.string(), async (chatId: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	try {
		const userChatKey = await db.userChatKey.findUnique({
			where: {
				userId_chatId: {
					userId: locals.user!.id,
					chatId
				}
			}
		});
		return userChatKey?.encryptedKey;
	} catch (e) {
		error(404, 'Not found');
	}
});

export const saveEncryptedChatKeySeed = command(
	v.object({ chatId: v.string(), encryptedKeySeed: v.string() }),
	async ({ chatId, encryptedKeySeed }) => {
		const { locals } = getRequestEvent();

		if (!locals.sessionId) {
			error(401, 'Unauthorized');
		}

		try {
			const userChatKey = await db.userChatKey.upsert({
				where: {
					userId_chatId: {
						userId: locals.user!.id,
						chatId: chatId
					}
				},
				update: {
					encryptedKey: encryptedKeySeed
				},
				create: {
					userId: locals.user!.id,
					chatId,
					encryptedKey: encryptedKeySeed
				}
			});
			return userChatKey?.encryptedKey;
		} catch (e) {
			error(500, 'Something went wrong');
		}
	}
);
