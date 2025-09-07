import { encryptReaction } from '$lib/crypto/message';
import { emojiPickerStore } from '$lib/stores/emojiPicker.svelte';
import { modalStore } from '$lib/stores/modal.svelte';
import { socketStore } from '$lib/stores/socket.svelte';
import type { ClientMessage, SafeUser } from '$lib/types';
import { untrack } from 'svelte';
import { getUserById } from './chat.remote';
import { chatStore } from '$lib/stores/chat.svelte';
import type { SystemMessage } from '$prisma';

function updateMessages() {
	chatStore.messages = messages;
}

let messages: ClientMessage[] = [];

let unreadMessages: ClientMessage[] = [];

/** Deletes the message for everyone in the chat */
export function handleDeleteMessage(message: ClientMessage): void {
	console.log('Delete message:', message.id);
	modalStore.confirm(
		'Delete Message',
		'Are you sure you want to delete this message?',
		async () => {
			if (!chatStore.activeChat) {
				modalStore.alert('Error', 'Failed to delete message: No chat selected');
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
			: 'No one';
	modalStore.alert(
		'Message Info',
		'Sent by: @' +
			message.user.username +
			'\nRead by: ' +
			readerNames +
			'\nUsed Key Version: ' +
			message.usedKeyVersion
	);
}

/** Opens an emoji picker for reacting on the message */
export function handleReaction(message: ClientMessage, userId: string): void {
	console.log('Reaction message:', message.id);
	const messageEl = document.querySelector(`[data-message-id="${message.id}"]`) as HTMLElement;
	const messageBubble = messageEl?.querySelector('.message-bubble') as HTMLElement;
	if (messageBubble) {
		emojiPickerStore.open(messageBubble, async (reaction: string) => {
			const encryptedReaction = await encryptReaction(reaction, userId, message.usedKeyVersion);
			socketStore.reactToMessage({
				messageId: message.id,
				encryptedReaction: encryptedReaction
			});
		});
	}
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
	options?: { triggerRerender?: boolean; invalidateDecryptionCache?: boolean }
): void {
	const index = messages.findIndex((m) => m.id === updatedMessage.id);
	if (options?.invalidateDecryptionCache === true) {
		updatedMessage.decryptedContent = undefined;
	}

	if (index !== -1) {
		messages[index] = updatedMessage;
	}

	if (!options || options.triggerRerender === true || options.triggerRerender === undefined) {
		updateMessages();
	}
}

/** Removes a message from messages array */
export function handleMessageDeleted(messageId: string): void {
	console.log('Message deleted:', messageId);
	messages = messages.filter((m) => m.id !== messageId);
	updateMessages();
}

/** Updates a messages array to display new read status on messages */
export async function handleMessagesRead(messageIds: string[], userId: string): Promise<void> {
	console.log('Messages read by user:', userId, messageIds);

	try {
		// Get user from cache/db using the remote function
		const user = await getUserById(userId);

		messages = messages.map((message) => {
			if (messageIds.includes(message.id)) {
				const isAlreadyRead = message.readBy.some((u) => u.id === userId);

				if (!isAlreadyRead) {
					return {
						...message,
						readBy: [...message.readBy, user]
					};
				}
			}
			return message;
		});
		updateMessages();
	} catch (err) {
		console.error('Failed to get user for read status update:', err);
	}
}

/** Updates the decrypted content of a message */
export function handleDecryptedMessage(message: ClientMessage, decryptedContent: string): void {
	untrack(() => {
		message.decryptedContent = decryptedContent;
		handleMessageUpdated(message, { triggerRerender: false });
	});
}

/** Shows appropriate error message */
export function handleDecryptError(
	error: any,
	message: ClientMessage,
	user: SafeUser | null
): void {
	console.log('Decrypt error:', error);

	messages = messages.map((m) => (m.id === message.id ? { ...m, decryptionFailed: true } : m));

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
			'Error',
			'Failed to decrypt message by chat owner @' +
				message.user.username +
				'. Something is wrong with your key.',
			{
				onClose: () => modalStore.removeFromQueue('decryption-chat-key-error'),
				id: 'decryption-chat-key-error'
			}
		);
		return;
	}

	modalStore.error(
		'Failed to decrypt you or the other user might have a wrong chat key. If you are unsure please ask the chat owner, they always have the correct key.'
	);
}

/** Sets the messages array */
export function setMessages(newMessages: ClientMessage[]): void {
	messages = newMessages;
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

/** Resets the decryptionFailed Record */
export function resetDecryptionFailed(): void {
	messages = messages.map((m) => ({ ...m, decryptionFailed: undefined }));
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
	messages = [...messages, message];
	updateMessages();
	//scrollToBottom();

	if (!chatStore.activeChat) {
		console.error('No chatId found, failed to mark new message as read');
		return;
	}

	markReadIfVisible(message);
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
	return messages.find((message) => message.id === id);
}
