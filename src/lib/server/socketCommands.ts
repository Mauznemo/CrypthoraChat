import { db } from '$lib/db';
import { error } from '@sveltejs/kit';
import { getIO, getUserSocket } from './socket';

/** Sends a system message to all connected clients in the chat */
export async function sendSystemMessage(chatId: string, content: string) {
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

/** Sends an event to all connected clients that have the chat selected */
export async function sendEventToChat(chatId: string, event: string, data: any) {
	const io = getIO();

	io.to(chatId).emit(event, data);
}

/** Sends an event to all connected clients that are joined in the chat no matter if they have it selected, chatId will be include in data */
export async function sendEventToUsersInChat(chatId: string, event: string, data: any) {
	const io = getIO();

	const chatParticipants = await db.chatParticipant.findMany({
		where: {
			chatId
		},
		select: {
			userId: true
		}
	});

	for (const participant of chatParticipants) {
		const userSocket = getUserSocket(participant.userId);
		if (userSocket) {
			io.to(userSocket).emit(event, { ...data, chatId });
		}
	}
}

/** Sends an event to a specific user if they are connected */
export async function sendEventToUser(userId: string, event: string, data: any) {
	const io = getIO();

	const userSocket = getUserSocket(userId);
	console.log('Sending event to user:', userSocket);
	if (!userSocket) return;

	io.to(userSocket).emit(event, data);
}
