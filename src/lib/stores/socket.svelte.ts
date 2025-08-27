// lib/stores/socket.svelte.ts
import type { MessageWithRelations } from '$lib/types';
import type { Prisma } from '$prisma';
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

	joinChat(chatId: string) {
		this.socket?.emit('join-chat', chatId);
	}

	leaveChat(chatId: string) {
		this.socket?.emit('leave-chat', chatId);
	}

	sendMessage(data: {
		chatId: string;
		senderId: string;
		encryptedContent: string;
		replyToId?: string | null;
		attachments?: string[];
	}) {
		this.socket?.emit('send-message', data);
	}

	editMessage(data: { messageId: string; encryptedContent: string }) {
		this.socket?.emit('edit-message', data);
	}

	deleteMessage(data: { messageId: string; chatId: string }) {
		this.socket?.emit('delete-message', data);
	}

	reactToMessage(data: { messageId: string; reaction: string }) {
		this.socket?.emit('react-to-message', data);
	}

	updateReaction(data: { messageId: string; reaction: string; operation: 'add' | 'remove' }) {
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

	onMessageUpdated(callback: (message: MessageWithRelations) => void) {
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

	off(event: string, callback?: Function) {
		this.socket?.off(event, callback);
	}

	notifyNewChat(data: { userIds: string[]; type: 'dm' | 'group'; chatId: string }) {
		console.log('Notifying about new chat:', data); // Debug log
		this.socket?.emit('chat-created', data);
	}

	onNewChat(
		callback: (data: { chatId: string; type: 'dm' | 'group'; forUsers?: string[] }) => void
	) {
		this.socket?.on('new-chat-created', (data: any) => {
			console.log('new chat created', data);
			// If forUsers is present, only call callback if current user is in the list
			if (!data.forUsers /*|| data.forUsers.includes(this.socket.userId)*/) {
				// TODO: Check if contains user id (cant access user id here at the moment)
				callback(data);
			}
		});
	}

	subscribeToPush(subscription: PushSubscription) {
		this.socket?.emit('subscribe-push', {
			subscription: subscription.toJSON()
		});
	}

	onConnect(callback: () => void) {
		this.socket?.on('connect', callback);
	}
}

export const socketStore = new SocketStore();
