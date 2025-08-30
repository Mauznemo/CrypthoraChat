import { emojiPickerStore } from '$lib/stores/emojiPicker.svelte';
import { modalStore } from '$lib/stores/modal.svelte';
import { socketStore } from '$lib/stores/socket.svelte';
import type { ChatWithoutMessages, MessageWithRelations, SafeUser } from '$lib/types';
import { getUserById } from '../../routes/chat/chat.remote';

let decryptionFailed: Record<string, boolean> = {};
let unreadMessages: string[] = [];

/** Deletes the message for everyone in the chat */
export function handleDeleteMessage(
	message: MessageWithRelations,
	activeChat: ChatWithoutMessages | null
): void {
	console.log('Delete message:', message.id);
	modalStore.confirm(
		'Delete Message',
		'Are you sure you want to delete this message?',
		async () => {
			if (!activeChat) {
				modalStore.alert('Error', 'Failed to delete message: No chat selected');
				return;
			}
			console.log('Message deleted:', message.id);
			socketStore.deleteMessage({ messageId: message.id, chatId: activeChat.id });
		}
	);
}

/** Shows an info modal for the message */
export function handleInfoMessage(message: MessageWithRelations): void {
	console.log('Show message info:', message.id);
	const readerNames =
		message.readBy.length > 0 ? message.readBy.map((user) => user.username).join(', ') : 'No one';
	modalStore.alert(
		'Message Info',
		'Sent by: ' + message.user.username + '\nRead by: ' + readerNames
	);
}

/** Opens an emoji picker for reacting on the message */
export function handleReaction(message: MessageWithRelations): void {
	console.log('Reaction message:', message.id);
	const messageEl = document.querySelector(`[data-message-id="${message.id}"]`) as HTMLElement;
	const messageBubble = messageEl?.querySelector('.message-bubble') as HTMLElement;
	console.log('Message element:', messageBubble);
	if (messageBubble) {
		emojiPickerStore.open(messageBubble, (emoji: string) => {
			console.log('Selected emoji:', emoji);
			socketStore.reactToMessage({
				messageId: message.id,
				reaction: emoji
			});
		});
	}
}

/** Adds or removes a reaction from the message */
export function handleUpdateReaction(
	message: MessageWithRelations,
	emoji: string,
	operation: 'add' | 'remove'
): void {
	console.log('Update reaction:', message.id, emoji, operation);
	socketStore.updateReaction({
		messageId: message.id,
		reaction: emoji,
		operation
	});
}

/** Updates a message from messages array @returns updated messages array */
export function handleMessageUpdated(
	updatedMessage: MessageWithRelations,
	messages: MessageWithRelations[]
): MessageWithRelations[] {
	const index = messages.findIndex((m) => m.id === updatedMessage.id);
	if (index !== -1) {
		messages[index] = updatedMessage;
	}
	return messages;
}

/** Removes a message from messages array @returns updated messages array */
export function handleMessageDeleted(
	messageId: string,
	messages: MessageWithRelations[]
): MessageWithRelations[] {
	console.log('Message deleted:', messageId);
	messages = messages.filter((m) => m.id !== messageId);
	return messages;
}

/** Updates a messages array to display new read status on messages @returns updated messages array */
export async function handleMessagesRead(
	messageIds: string[],
	userId: string,
	messages: MessageWithRelations[]
): Promise<MessageWithRelations[]> {
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
	} catch (err) {
		console.error('Failed to get user for read status update:', err);
	}

	return messages;
}

/** Shows appropriate error message */
export function handleDecryptError(
	error: any,
	message: MessageWithRelations,
	user: SafeUser | null
): void {
	console.log('Decrypt error:', error);

	decryptionFailed[message.id] = true;

	// Check if the user's own key is wrong (chat owner always has correct key)
	const myKeyWrong = message.chat.ownerId === message.user.id;

	if (!myKeyWrong) {
		const lastFail = localStorage.getItem('lastDecryptErrorDate');

		if (lastFail) {
			const lastFailDate = JSON.parse(lastFail);
			const lastFailTime = new Date(lastFailDate).getTime();
			const currentMessageTime = new Date(message.timestamp).getTime();

			// If current message is older than the last failed message, ignore it
			if (currentMessageTime <= lastFailTime) {
				return;
			}
		}
	}

	localStorage.setItem(
		'lastDecryptErrorDate',
		JSON.stringify(new Date(message.timestamp).getTime())
	);

	const userOwnsChat = message.chat.ownerId === user?.id;

	if (userOwnsChat) {
		modalStore.alert(
			'Error',
			'Failed to decrypt message by user @' +
				message.user.username +
				'. Please re-share the chat key with them. Since they have a wrong one.'
		);
		return;
	}

	if (myKeyWrong) {
		modalStore.alert(
			'Error',
			'Failed to decrypt message by chat owner @' +
				message.user.username +
				'. This means your chat key is wrong. Please re-input the correct key.',
			{
				onOk: () => modalStore.removeFromQueue('decryption-chat-key-error'),
				id: 'decryption-chat-key-error'
			}
		);
		return;
	}

	modalStore.alert(
		'Error',
		'Failed to decrypt you or the other user might have a wrong chat key. If you are unsure please ask the chat owner, they always have the correct key.'
	);
}

/** Resets the decryptionFailed Record */
export function resetDecryptionFailed(): void {
	decryptionFailed = {};
}

/** Marks another user's messages as read after a delay (to make sure message was decrypted successfully) */
export function markReadAfterDelay(
	messages: MessageWithRelations[],
	activeChat: ChatWithoutMessages | null
): void {
	setTimeout(() => {
		if (!activeChat) return;
		const readableMessages = messages.filter((message) => decryptionFailed[message.id] !== true);

		socketStore.markMessagesAsRead({
			messageIds: readableMessages.map((message) => message.id),
			chatId: activeChat.id
		});
	}, 500);
}

/** Adds a new message to messages array @returns updated messages array */
export function handleNewMessage(
	message: MessageWithRelations,
	userId: string | undefined,
	activeChat: ChatWithoutMessages | null,
	messages: MessageWithRelations[]
): MessageWithRelations[] {
	messages = [...messages, message];
	//scrollToBottom();

	if (!activeChat) {
		console.error('No chatId found, failed to mark new message as read');
		return messages;
	}

	if (message.senderId !== userId && userId) {
		if (!document.hidden) {
			// Wait a bit for message to be decrypted or fail at that
			markReadAfterDelay([message], activeChat);
		} else {
			unreadMessages = [...unreadMessages, message.id];
		}
	}

	return messages;
}

/** Marks all unread messages as read when the page becomes visible */
export function handleVisible(activeChat: ChatWithoutMessages): void {
	if (unreadMessages.length > 0) {
		// Filter out messages that failed decryption
		const readableMessages = unreadMessages.filter(
			(messageId) => decryptionFailed[messageId] !== true
		);

		if (readableMessages.length > 0) {
			socketStore.markMessagesAsRead({
				messageIds: readableMessages,
				chatId: activeChat.id
			});
		}

		unreadMessages = []; // Clear the unread list
	}
}
