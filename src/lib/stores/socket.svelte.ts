// lib/stores/socket.svelte.ts
import type {
	ChatParticipant,
	ChatWithoutMessages,
	MessageWithRelations,
	SafeUser
} from '$lib/types';
import type { Prisma, SystemMessage } from '$prisma';
import { Socket } from 'socket.io-client';
import ioClient from 'socket.io-client';

class SocketStore {
	private socket: typeof Socket | null = null;
	public connected = $state(false);
	public typing = $state<{ userId: string; username: string; isTyping: boolean }[]>([]);

	connect(serverUrl: string = 'http://localhost:3000') {
		console.log('Connecting to server...');
		if (this.socket?.connected) return;
		console.log('Not connected, connecting...');

		const socketUrl = import.meta.env.PROD ? window.location.origin : 'http://localhost:3000';

		this.socket = ioClient(socketUrl);

		this.socket.on('connect_error', (err: any) => console.log('Connect error:', err));

		this.socket.on('connect', () => {
			this.connected = true;
			console.log('Connected to server');
		});

		this.socket.on('disconnect', () => {
			this.connected = false;
			console.log('Disconnected from server');
		});

		this.socket.on(
			'user-typing',
			(data: { userId: string; username: string; isTyping: boolean }) => {
				const existingIndex = this.typing.findIndex((t) => t.userId === data.userId);

				if (data.isTyping) {
					if (existingIndex === -1) {
						this.typing.push(data);
					} else {
						this.typing[existingIndex] = data;
					}
				} else {
					if (existingIndex !== -1) {
						this.typing.splice(existingIndex, 1);
					}
				}
			}
		);
	}

	disconnect() {
		console.log('Disconnecting from server...');
		if (this.socket) {
			this.socket.disconnect();
			this.socket = null;
			this.connected = false;
			this.typing = [];
		}
	}

	onConnect(callback: () => void) {
		this.socket?.on('connect', callback);
	}

	off(event: string, callback?: Function) {
		this.socket?.off(event, callback);
	}

	// ---------- Chat selected specific (on only called if currently in that chat) ---------- //

	joinChat(chatId: string) {
		this.socket?.emit('join-chat', chatId);
	}

	leaveChat(chatId: string) {
		this.socket?.emit('leave-chat', chatId);
	}

	tryLeaveChat(chat: ChatWithoutMessages | null) {
		if (chat) this.leaveChat(chat.id);
	}

	sendMessage(data: {
		chatId: string;
		keyVersion: number;
		senderId: string;
		encryptedContent: string;
		replyToId?: string | null;
		attachments?: string[];
	}) {
		this.socket?.emit('send-message', data);
	}

	editMessage(data: { messageId: string; encryptedContent: string; keyVersion: number }) {
		this.socket?.emit('edit-message', data);
	}

	deleteMessage(data: { messageId: string; chatId: string }) {
		this.socket?.emit('delete-message', data);
	}

	reactToMessage(data: { messageId: string; encryptedReaction: string }) {
		this.socket?.emit('react-to-message', data);
	}

	updateReaction(data: {
		messageId: string;
		encryptedReaction: string;
		operation: 'add' | 'remove';
	}) {
		this.socket?.emit('update-reaction', data);
	}

	markMessagesAsRead(data: { messageIds: string[]; chatId: string }) {
		this.socket?.emit('mark-messages-read', data);
	}

	startTyping(data: { chatId: string; username: string }) {
		this.socket?.emit('typing-start', data);
	}

	stopTyping(data: { chatId: string }) {
		this.socket?.emit('typing-stop', data);
	}

	onNewMessage(callback: (message: MessageWithRelations) => void) {
		this.socket?.on('new-message', callback);
	}

	onNewMessageNotify(
		callback: (data: { chatId: string; chatName: string; username: string }) => void
	) {
		this.socket?.on('new-message-notify', callback);
	}

	onMessageUpdated(
		callback: (data: { message: MessageWithRelations; type: 'edit' | 'reaction' }) => void
	) {
		this.socket?.on('message-updated', callback);
	}

	onMessageDeleted(callback: (messageId: string) => void) {
		this.socket?.on('message-deleted', callback);
	}

	onMessagesRead(callback: (data: { messageIds: string[]; userId: string }) => void) {
		this.socket?.on('messages-read', callback);
	}

	onMessageError(callback: (error: { error: string }) => void) {
		this.socket?.on('message-error', callback);
	}

	onNewSystemMessage(callback: (message: SystemMessage) => void) {
		this.socket?.on('new-system-message', callback);
	}

	//TODO: call from server
	notifyKeyRotated(data: { chatId: string }) {
		this.socket?.emit('key-rotated', data);
	}

	onKeyRotated(callback: () => void) {
		this.socket?.on('key-rotated', callback);
	}

	onChatUsersUpdated(
		callback: (data: {
			chatId: string;
			user?: SafeUser;
			chatParticipant?: ChatParticipant;
			action: 'add' | 'remove';
		}) => void
	) {
		this.socket?.on('chat-users-updated', callback);
	}

	onChatUpdated(
		callback: (data: {
			chatId: string;
			newName: string | null;
			newImagePath: string | null;
		}) => void
	) {
		this.socket?.on('chat-updated', callback);
	}

	// ---------- Chat specific (only sent to users joined in the chat) ---------- //

	// ---------- User specific ---------- //
	//TODO: call from server
	notifyNewChat(data: { userIds: string[]; type: 'dm' | 'group'; chatId: string }) {
		console.log('Notifying about new chat:', data); // Debug log
		this.socket?.emit('chat-created', data);
	}

	onNewChat(callback: (data: { chatId: string; type: 'dm' | 'group' }) => void) {
		this.socket?.on('new-chat-created', callback);
	}

	onRemovedFromChat(callback: (data: { chatId: string }) => void) {
		this.socket?.on('removed-from-chat', callback);
	}

	requestUserVerify(data: { userId: string }) {
		this.socket?.emit('request-user-verify', data);
	}

	onUserVerifyRequested(
		callback: (data: { requestorId: string; requestorUsername: string }) => void
	) {
		this.socket?.on('requested-user-verify', callback);
	}

	subscribeToNtfyPush(topic: string) {
		this.socket?.emit('subscribe-ntfy-push', {
			topic
		});
	}

	subscribeToWebPush(subscription: PushSubscription) {
		this.socket?.emit('subscribe-webpush', {
			subscription: subscription.toJSON()
		});
	}
}

export const socketStore = new SocketStore();
