import { command, getRequestEvent } from '$app/server';
import { db } from '$lib/db';
import { sendEventToChat, sendEventToUser, sendSystemMessage } from '$lib/server/socketCommands';
import type { SafeUser } from '$lib/types';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';

const removeUserFromChatSchema = v.object({
	chatId: v.string(),
	userId: v.string()
});

export const removeUserFromChat = command(removeUserFromChatSchema, async ({ chatId, userId }) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const chat = await db.chat.findUnique({
		where: { id: chatId },
		select: { ownerId: true, participants: { select: { userId: true } } }
	});

	if (!chat) {
		error(404, 'Chat not found');
	}

	if (chat.ownerId !== locals.user!.id) {
		error(403, 'You do not own this chat, please ask the owner to remove members.');
	}

	const user = await db.user.findUnique({
		where: {
			id: userId
		}
	});

	if (!user) {
		error(404, 'User not found');
	}

	if (!chat.participants.some((participant) => participant.userId === userId)) {
		error(400, 'User is not in the chat.');
	}

	try {
		await db.userChatKey.delete({
			where: {
				userId_chatId: {
					userId,
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
					userId
				}
			}
		});

		await db.publicUserChatKey.deleteMany({
			where: {
				chatId: chatId,
				userId: userId
			}
		});

		sendEventToUser(userId, 'removed-from-chat', { chatId });

		sendSystemMessage(
			chatId,
			locals.user!.username + ' removed @' + user.username + ' from the chat.'
		);

		sendEventToChat(chatId, 'chat-users-updated', {
			user: user as SafeUser,
			chatId,
			action: 'remove'
		});
	} catch (e) {
		console.error('Failed to remove user from chat:', e);
		error(500, 'Failed to remove user from chat');
	}
});

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
