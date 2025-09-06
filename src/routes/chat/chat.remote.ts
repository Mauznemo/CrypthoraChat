import { command, getRequestEvent, query } from '$app/server';
import { db } from '$lib/db';
import { getIO } from '$lib/server/socket';
import { chatWithoutMessagesFields, safeUserFields } from '$lib/types';
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

	const participant = await db.chatParticipant.findUnique({
		where: {
			chatId_userId: { chatId, userId: locals.user!.id }
		},
		select: { joinKeyVersion: true }
	});

	if (!participant) {
		error(403, 'You are not a participant of this chat');
	}

	const messages = await db.message.findMany({
		where: {
			chatId,
			usedKeyVersion: { gte: participant.joinKeyVersion }
		},
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

	const systemMessages = await db.systemMessage.findMany({
		where: { chatId, usedKeyVersion: { gte: participant.joinKeyVersion } },
		orderBy: { timestamp: 'asc' }
	});

	console.log('Queried messages: ', messages.length);

	return { messages, systemMessages };
});

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

export const addUserToChat = command(v.string(), async (chatId: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	sendSystemMessage(chatId, locals.user!.username + ' clicked add user');
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

// TODO: Move this to separate file
async function sendSystemMessage(chatId: string, content: string) {
	const io = getIO();

	const chat = await db.chat.findUnique({
		where: { id: chatId },
		select: { currentKeyVersion: true }
	});

	if (!chat) {
		error(404, 'Chat not found');
	}

	const message = await db.systemMessage.create({
		data: {
			chatId,
			content,
			usedKeyVersion: chat.currentKeyVersion
		}
	});

	io.to(chatId).emit('new-system-message', message);
}

const rotateChatKeySchema = v.object({
	chatId: v.string(),
	newEncryptedUserChatKeys: v.record(v.string(), v.string()),
	newKeyVersion: v.number()
});

export const rotateChatKey = command(
	rotateChatKeySchema,
	async ({ chatId, newEncryptedUserChatKeys, newKeyVersion }) => {
		const { locals } = getRequestEvent();

		if (!locals.sessionId) {
			error(401, 'Unauthorized');
		}

		try {
			const chat = await db.chat.findUnique({
				where: { id: chatId },
				select: { ownerId: true }
			});

			if (!chat) {
				error(404, 'Chat not found');
			}

			if (chat?.ownerId !== locals.user?.id) {
				error(403, 'You are not the owner of this chat');
			}

			console.log('Rotating chat key:', newKeyVersion);

			const updatedChat = await db.chat.update({
				where: { id: chatId },
				data: {
					currentKeyVersion: newKeyVersion,
					publicUserChatKeys: {
						create: Object.entries(newEncryptedUserChatKeys).map(([userId, encryptedChatKey]) => ({
							userId,
							encryptedKey: encryptedChatKey,
							keyVersion: newKeyVersion
						}))
					}
				}
			});

			sendSystemMessage(chatId, `The chat key has been rotated to version ${newKeyVersion}.`);
		} catch (e) {
			console.log('Error rotating chat key:', e);
			error(500, 'Something went wrong.');
		}
	}
);

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
