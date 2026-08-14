// lib/stores/socket.svelte.ts
import type {
	ChatParticipant,
	ChatWithoutMessages,
	MessageWithRelations,
	SafeUser
} from '$lib/types';
import type { SystemMessage } from '$prisma';
import { Socket } from 'socket.io-client';
import ioClient from 'socket.io-client';

type Handler = (...args: any[]) => void;

/** Removes exactly the one handler it was created for */
export type Unsubscribe = () => void;

export type ClientPresence = 'online' | 'offline';
export type VerifyRequestStatus = 'delivered' | 'background' | 'offline' | 'rate-limited';
export type VerifyResponse = 'accepted' | 'declined' | 'busy' | 'matched' | 'failed';

/**
 * Collects unsubscribe functions so a component can tear down every listener it
 * registered without touching listeners it does not own.
 */
export class SocketListeners {
	private unsubs: Unsubscribe[] = [];

	add(unsub: Unsubscribe): void {
		this.unsubs.push(unsub);
	}

	dispose(): void {
		for (const unsub of this.unsubs) unsub();
		this.unsubs = [];
	}
}

export function socketListeners(): SocketListeners {
	return new SocketListeners();
}

class SocketStore {
	private socket: typeof Socket | null = null;
	/** Every consumer-registered handler, so they can be re-bound to a fresh socket */
	private handlers = new Map<string, Set<Handler>>();
	public connected = $state(false);
	public typing = $state<{ userId: string; username: string; isTyping: boolean }[]>([]);

	/** Idempotent. Safe to call from any route, any number of times. */
	connect() {
		if (this.socket) {
			// Re-sync from the real socket: `connected` must never latch independently of it.
			this.connected = this.socket.connected;
			if (!this.socket.connected) this.socket.connect();
			return;
		}

		const socketUrl = import.meta.env.PROD ? window.location.origin : 'http://localhost:3000';

		this.socket = ioClient(socketUrl);

		this.bindInternalHandlers();
		this.bindRegisteredHandlers();
		this.connected = this.socket.connected;
	}

	/**
	 * The store's own listeners. Deliberately kept out of `handlers` so no consumer can
	 * hold a reference to them, and `off()` can never remove them.
	 */
	private bindInternalHandlers() {
		if (!this.socket) return;

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

	/** Re-attaches every registered handler after the socket object is (re)created */
	private bindRegisteredHandlers() {
		if (!this.socket) return;
		for (const [event, set] of this.handlers) {
			for (const handler of set) this.socket.on(event, handler);
		}
	}

	disconnect() {
		console.log('Disconnecting from server...');
		if (this.socket) {
			this.socket.disconnect();
			this.socket = null;
			this.connected = false;
			this.typing = [];
		}
		// `handlers` is kept so a later connect() re-binds everything.
	}

	/** Registers a listener that survives socket re-creation. Returns its unsubscribe. */
	on(event: string, handler: Handler): Unsubscribe {
		let set = this.handlers.get(event);
		if (!set) {
			// Plain Set on purpose: this is internal bookkeeping, never read from a template,
			// so it does not need to be reactive.
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			set = new Set();
			this.handlers.set(event, set);
		}
		set.add(handler);
		this.socket?.on(event, handler);
		return () => this.off(event, handler);
	}

	/**
	 * Removes ONE handler. There is deliberately no remove-all-for-event overload: a bare
	 * `off('connect')` used to strip the store's own connect handler, latching `connected`
	 * to false while the socket was actually up.
	 */
	off(event: string, handler: Handler): void {
		this.handlers.get(event)?.delete(handler);
		this.socket?.off(event, handler);
	}

	/**
	 * Runs `cb` on every connect. If the socket is already connected when this is called,
	 * `cb(false)` fires once on the next microtask; every real connect event fires `cb(true)`.
	 */
	onConnect(cb: (isReconnect: boolean) => void): Unsubscribe {
		let disposed = false;
		const unsub = this.on('connect', () => cb(true));

		if (this.socket?.connected) {
			queueMicrotask(() => {
				if (!disposed) cb(false);
			});
		}

		return () => {
			disposed = true;
			unsub();
		};
	}

	/** emit + ack with a timeout. Rejects if the server does not ack in time. */
	private emitWithAck<T>(event: string, data: any, timeoutMs = 8000): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			if (!this.socket) return reject(new Error('Socket not connected'));
			// The stale @types/socket.io-client devDep shadows socket.io-client v4's own
			// types, which do know about .timeout().
			(this.socket as any)
				.timeout(timeoutMs)
				.emit(event, data, (err: any, response: T) => (err ? reject(err) : resolve(response)));
		});
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
		attachmentPaths?: string[];
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

	onNewMessage(callback: (message: MessageWithRelations) => void): Unsubscribe {
		return this.on('new-message', callback);
	}

	onNewMessageNotify(
		callback: (data: { chatId: string; chatName: string; username: string }) => void
	): Unsubscribe {
		return this.on('new-message-notify', callback);
	}

	onMessageUpdated(
		callback: (data: { message: MessageWithRelations; type: 'edit' | 'reaction' }) => void
	): Unsubscribe {
		return this.on('message-updated', callback);
	}

	onMessageDeleted(callback: (messageId: string) => void): Unsubscribe {
		return this.on('message-deleted', callback);
	}

	onMessagesRead(callback: (data: { messageIds: string[]; userId: string }) => void): Unsubscribe {
		return this.on('messages-read', callback);
	}

	onMessageError(callback: (error: { error: string }) => void): Unsubscribe {
		return this.on('message-error', callback);
	}

	onNewSystemMessage(callback: (message: SystemMessage) => void): Unsubscribe {
		return this.on('new-system-message', callback);
	}

	/** Emitted by the server from rotateChatKey, to every member regardless of selected chat */
	onKeyRotated(callback: (data: { chatId: string; newKeyVersion: number }) => void): Unsubscribe {
		return this.on('key-rotated', callback);
	}

	onChatUsersUpdated(
		callback: (data: {
			chatId: string;
			user?: SafeUser;
			chatParticipant?: ChatParticipant;
			action: 'add' | 'remove';
		}) => void
	): Unsubscribe {
		return this.on('chat-users-updated', callback);
	}

	onChatUpdated(
		callback: (data: {
			chatId: string;
			newName: string | null;
			newImagePath: string | null;
		}) => void
	): Unsubscribe {
		return this.on('chat-updated', callback);
	}

	// ---------- Chat specific (only sent to users joined in the chat) ---------- //

	// ---------- User specific ---------- //

	/** Emitted by the server from createDm/createGroup/addUserToChat */
	onNewChat(callback: (data: { chatId: string; type: 'dm' | 'group' }) => void): Unsubscribe {
		return this.on('new-chat-created', callback);
	}

	onRemovedFromChat(callback: (data: { chatId: string }) => void): Unsubscribe {
		return this.on('removed-from-chat', callback);
	}

	// ---------- Presence ---------- //

	/** Pushed by the server whenever a user sharing a chat with me goes online or offline */
	onUserPresence(
		callback: (data: { userId: string; presence: ClientPresence }) => void
	): Unsubscribe {
		return this.on('user-presence', callback);
	}

	/**
	 * Seeds presence for the given users. The server answers only for users sharing a chat
	 * with me; anyone else is simply absent from the result.
	 */
	requestPresence(userIds: string[]): Promise<Record<string, ClientPresence>> {
		return this.emitWithAck<Record<string, ClientPresence>>('get-presence', userIds);
	}

	// ---------- User verification ---------- //

	/** Asks the server to deliver a verification request; the ack reports peer reachability */
	requestUserVerify(data: {
		requestId: string;
		userId: string;
	}): Promise<{ status: VerifyRequestStatus }> {
		return this.emitWithAck<{ status: VerifyRequestStatus }>('request-user-verify', data);
	}

	respondUserVerify(data: { requestId: string; toUserId: string; response: VerifyResponse }): void {
		this.socket?.emit('respond-user-verify', data);
	}

	cancelUserVerify(data: { requestId: string; userId: string }): void {
		this.socket?.emit('cancel-user-verify', data);
	}

	onUserVerifyRequested(
		callback: (data: { requestId: string; requestorId: string; requestorUsername: string }) => void
	): Unsubscribe {
		return this.on('requested-user-verify', callback);
	}

	onUserVerifyResponse(
		callback: (data: {
			requestId: string;
			responderId: string;
			responderUsername: string;
			response: VerifyResponse;
		}) => void
	): Unsubscribe {
		return this.on('user-verify-response', callback);
	}

	/** Another tab of mine already answered this request */
	onUserVerifyHandled(callback: (data: { requestId: string }) => void): Unsubscribe {
		return this.on('user-verify-handled', callback);
	}

	onUserVerifyCancelled(callback: (data: { requestId: string }) => void): Unsubscribe {
		return this.on('user-verify-cancelled', callback);
	}

	subscribeToNtfyPush(topic: string) {
		this.socket?.emit('subscribe-ntfy-push', {
			topic
		});
	}

	subscribeToFcmPush(token: string) {
		this.socket?.emit('subscribe-fcm-push', {
			token
		});
	}

	subscribeToWebPush(subscription: PushSubscription) {
		this.socket?.emit('subscribe-webpush', {
			subscription: subscription.toJSON()
		});
	}

	setSocketSessionActive() {
		this.socket?.emit('active', {});
	}

	setSocketSessionInactive() {
		this.socket?.emit('inactive', {});
	}
}

export const socketStore = new SocketStore();
