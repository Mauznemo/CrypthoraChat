import { encryptReaction } from '$lib/crypto/message';
import { emojiPickerStore } from '$lib/stores/emojiPicker.svelte';
import { modalStore } from '$lib/stores/modal.svelte';
import { socketStore } from '$lib/stores/socket.svelte';
import type { ClientMessage, SafeUser } from '$lib/types';
import { untrack } from 'svelte';
import { getUserById } from './chat.remote';
import { chatStore } from '$lib/stores/chat.svelte';
import type { SystemMessage } from '$prisma';
import { showChatNotification } from '$lib/stores/notifications.svelte';
import { chatList } from './chatList';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';

function updateMessages() {
	//chatStore.messages = chatStore.messages;
}

let unreadMessages: ClientMessage[] = [];

/** Deletes the message for everyone in the chat */
export function handleDeleteMessage(message: ClientMessage): void {
	console.log('Delete message:', message.id);
	modalStore.confirm(
		get(t)('common.are-you-sure'),
		get(t)('chat.messages.delete-message-confirm'),
		async () => {
			if (!chatStore.activeChat) {
				modalStore.error(get(t)('chat.messages.failed-to-delete-message'));
				return;
			}
			console.log('Message deleted:', message.id);
			socketStore.deleteMessage({ messageId: message.id, chatId: chatStore.activeChat.id });
		}
	);
}

/** Shows an info modal for the message */
export function handleInfoMessage(message: ClientMessage): void {
	console.log('Show message info:', message.id);
	const readerNames =
		message.readBy.length > 0
			? message.readBy.map((user) => '@' + user.username).join(', ')
			: get(t)('chat.messages.none');
	modalStore.alert(
		get(t)('chat.messages.message-info'),
		get(t)('chat.messages.sent-by') +
			' @' +
			message.user.username +
			'\n' +
			get(t)('chat.messages.read-by') +
			' ' +
			readerNames +
			'\n' +
			get(t)('chat.messages.used-key-version') +
			' ' +
			message.usedKeyVersion
	);
}

/** Opens an emoji picker for reacting on the message */
export function handleReaction(
	message: ClientMessage,
	position: { x: number; y: number },
	userId: string
): void {
	console.log('Reaction message:', message.id);

	emojiPickerStore.openAt(position, async (reaction: string) => {
		const encryptedReaction = await encryptReaction(reaction, userId, message.usedKeyVersion);
		socketStore.reactToMessage({
			messageId: message.id,
			encryptedReaction: encryptedReaction
		});
	});
}

/** Adds or removes a reaction from the message */
export async function handleUpdateReaction(
	message: ClientMessage,
	encryptedReaction: string,
	operation: 'add' | 'remove'
): Promise<void> {
	socketStore.updateReaction({
		messageId: message.id,
		encryptedReaction: encryptedReaction,
		operation
	});
}

/** Updates a message from messages array */
export function handleMessageUpdated(
	updatedMessage: ClientMessage,
	update: { viewed?: boolean; content?: boolean; reactions?: boolean; decryptionFailed?: boolean },
	options?: {
		triggerRerender?: boolean;
	}
): void {
	const index = chatStore.messages.findIndex((m) => m.id === updatedMessage.id);

	if (index === -1) return;

	if (update.viewed === true) {
		chatStore.messages[index].readBy = [...updatedMessage.readBy];
	}

	if (update.content === true) {
		chatStore.messages[index].encryptedContent = updatedMessage.encryptedContent;
	}

	if (update.reactions === true) {
		chatStore.messages[index].encryptedReactions = updatedMessage.encryptedReactions;
	}

	if (update.decryptionFailed === true) {
		chatStore.messages[index].decryptionFailed = updatedMessage.decryptionFailed;
	}

	if (!options || options.triggerRerender === true || options.triggerRerender === undefined) {
		updateMessages();
	}
}

/** Removes a message from messages array */
export function handleMessageDeleted(messageId: string): void {
	console.log('Message deleted:', messageId);
	const idx = chatStore.messages.findIndex((m) => m.id === messageId);
	if (idx !== -1) {
		chatStore.messages.splice(idx, 1);
		updateMessages();
	}
}

/** Updates a messages array to display new read status on messages */
export async function handleMessagesRead(messageIds: string[], userId: string): Promise<void> {
	console.log('Messages read by user:', userId, messageIds);

	try {
		const user = await getUserById(userId);

		if (!user) return;

		for (const messageId of messageIds) {
			const index = chatStore.messages.findIndex((m) => m.id === messageId);
			if (index === -1) continue;

			if (chatStore.messages[index].readBy.some((u) => u.id === user.id)) continue;

			chatStore.messages[index].readBy = [...chatStore.messages[index].readBy, user];
		}
		updateMessages();
	} catch (err) {
		console.error('Failed to get user for read status update:', err);
	}
}

/** Shows appropriate error message */
export function handleDecryptError(
	error: any,
	message: ClientMessage,
	user: SafeUser | null
): void {
	console.log('Decrypt error:', error);

	handleMessageUpdated(message, { decryptionFailed: true }, { triggerRerender: false });

	// Check if the user's own key is wrong (chat owner always has correct key)
	const myKeyWrong = message.chat.ownerId === message.user.id;

	const allErrors = JSON.parse(localStorage.getItem('lastDecryptErrors') || '{}');

	if (!myKeyWrong) {
		const lastFailTime = allErrors[message.chat.id];

		if (lastFailTime) {
			//const lastFailTime = new Date(lastFailDate).getTime();
			const currentMessageTime = new Date(message.timestamp).getTime();

			// If current message is older than the last failed message, ignore it
			if (currentMessageTime <= lastFailTime) {
				return;
			}
		}
	}

	allErrors[message.chat.id] = new Date(message.timestamp).getTime();
	localStorage.setItem('lastDecryptErrors', JSON.stringify(allErrors));

	const userOwnsChat = message.chat.ownerId === user?.id;

	if (userOwnsChat) {
		modalStore.alert(
			'Error',
			'Failed to decrypt message by user @' +
				message.user.username +
				'. Something is wrong with their key.',
			{
				onClose: () => modalStore.removeFromQueue('decryption-chat-key-error'),
				id: 'decryption-chat-key-error'
			}
		);
		return;
	}

	if (myKeyWrong) {
		modalStore.alert(
			get(t)('common.error'),
			get(t)('chat.messages.failed-to-decrypt-message-by-owner', {
				values: { username: message.user.username }
			}),
			{
				onClose: () => modalStore.removeFromQueue('decryption-chat-key-error'),
				id: 'decryption-chat-key-error'
			}
		);
		return;
	}

	modalStore.error(get(t)('chat.messages.failed-to-decrypt-message'));
}

/** Sets the messages array */
export function setMessages(newMessages: ClientMessage[]): void {
	chatStore.messages = [...newMessages];
	updateMessages();
}

export function addMessages(newMessages: ClientMessage[]): void {
	chatStore.messages.push(...newMessages);
	updateMessages();
}

export function addMessagesAtBeginning(newMessages: ClientMessage[]): void {
	chatStore.messages.unshift(...newMessages);
	updateMessages();
}

/** Sets the system messages array */
export function setSystemMessages(newMessages: SystemMessage[]): void {
	chatStore.systemMessages = newMessages;
}

/** Checks if the message is a client message or a system message */
export function isClientMessage(message: ClientMessage | SystemMessage): message is ClientMessage {
	return 'encryptedContent' in message;
}

/** Marks a message as read if the page is visible */
export function markReadIfVisible(message: ClientMessage): void {
	if (message.senderId !== chatStore.user?.id && chatStore.user) {
		if (!document.hidden) {
			// Wait a bit for message to be decrypted or fail at that
			markReadAfterDelay([message]);
		} else {
			unreadMessages.push(message);
		}
	}
}

/** Marks another user's messages as read after a delay (to make sure message was decrypted successfully) */
export function markReadAfterDelay(messages: ClientMessage[]): void {
	setTimeout(() => {
		console.log('Messages:', messages.length);

		if (!chatStore.activeChat) return;
		const readableMessages = messages.filter((message) => message.decryptionFailed !== true);

		console.log('Readable messages:', readableMessages.length);

		markRead(readableMessages);
	}, 500);
}

/** Marks messages as read */
export function markRead(messages: ClientMessage[]): void {
	if (!chatStore.activeChat) return;
	socketStore.markMessagesAsRead({
		messageIds: messages.map((message) => message.id),
		chatId: chatStore.activeChat.id
	});
}

/** Adds a new message to messages array */
export function handleNewMessage(message: ClientMessage): void {
	chatStore.messages.push(message);
	updateMessages();
	//scrollToBottom();

	if (!chatStore.activeChat) {
		console.error('No chatId found, failed to mark new message as read');
		return;
	}

	markReadIfVisible(message);
}

export function handleNewMessageNotify(data: {
	chatId: string;
	chatName: string;
	username: string;
}): void {
	const chat = chatStore.chats.find((chat) => chat.id === data.chatId);
	if (!chat) return;
	chat.lastMessageAt = new Date();
	if (chatStore.activeChat?.id !== data.chatId) {
		if (!chat.unreadMessages) chat.unreadMessages = 0;
		chat.unreadMessages += 1;
	}
	chatList.updateChat(chat);

	if (!document.hidden || data.username === chatStore.user?.username) return;

	showChatNotification(
		data.username,
		data.chatId,
		chat.type === 'group' ? 'group' : 'dm',
		data.chatName || ''
	);
}

export function handleNewSystemMessage(message: SystemMessage): void {
	chatStore.systemMessages = [...chatStore.systemMessages, message];
}

/** Marks all unread messages as read when the page becomes visible */
export function handleVisible(): void {
	if (unreadMessages.length > 0) {
		// Filter out messages that failed decryption
		const readableMessages = unreadMessages.filter((message) => message.decryptionFailed !== true);

		if (readableMessages.length > 0) {
			markRead(readableMessages);
		}

		unreadMessages = [];
	}
}

/** Finds a message from the messages array by id */
export function findMessageById(id: string): ClientMessage | undefined {
	return chatStore.messages.find((message) => message.id === id);
}
