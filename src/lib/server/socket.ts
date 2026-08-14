import { Server, Socket } from 'socket.io';
import { type Server as HTTPServer } from 'http';
import { db } from '../db';
import { validateSession } from '../utils/auth';
import webpush from 'web-push';
import 'dotenv/config';
import { removeFile } from './fileUpload';
import {
	getImageUrl,
	sendNtfyNotification,
	sendWebpushNotification,
	type NotificationDate
} from './pushNotifications';
import { sendFcmNotification } from './fcm';

const VAPID_EMAIL = process.env.VAPID_EMAIL;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const PUBLIC_VAPID_KEY = process.env.PUBLIC_VAPID_KEY;

interface AuthenticatedSocket extends Socket {
	user?: {
		id: string;
		username: string;
		sessionId: string;
	};
}

if (VAPID_EMAIL && VAPID_PRIVATE_KEY && PUBLIC_VAPID_KEY) {
	webpush.setVapidDetails(`mailto:${VAPID_EMAIL}`, PUBLIC_VAPID_KEY, VAPID_PRIVATE_KEY);
}

interface WebpushSubData {
	sessionId: string;
	userId: string;
	subscription: PushSubscription;
}

interface NtfySubData {
	sessionId: string;
	userId: string;
	subscription: string;
}

interface FcmSubData {
	sessionId: string;
	userId: string;
	subscription: string;
}

const webpushSubscriptions = new Map<string, WebpushSubData>();
const ntfySubscriptions = new Map<string, NtfySubData>();
const fcmSubscriptions = new Map<string, FcmSubData>();

function getUserSubscriptions(userId: string) {
	const ntfySubs = Array.from(ntfySubscriptions.values()).filter((sub) => sub.userId === userId);
	const webpushSubs = Array.from(webpushSubscriptions.values()).filter(
		(sub) => sub.userId === userId
	);
	const fcmSubs = Array.from(fcmSubscriptions.values()).filter((sub) => sub.userId === userId);
	return { ntfySubs, webpushSubs, fcmSubs };
}

/**
 * Drops a session from all in memory maps.
 *
 * A session only ever has one subscription row (`@@unique([sessionId])`), so when it switches
 * provider the db row is replaced but the old map entry would otherwise linger and the device would
 * get the same notification twice until the server restarts.
 */
function clearSessionSubscriptions(sessionId: string) {
	webpushSubscriptions.delete(sessionId);
	ntfySubscriptions.delete(sessionId);
	fcmSubscriptions.delete(sessionId);
}

async function saveSubscription(data: {
	sessionId: string;
	userId: string;
	webpushSubscription?: PushSubscription;
	ntfySubscription?: string;
	fcmSubscription?: string;
}) {
	if (!data.sessionId || !data.userId) return;
	clearSessionSubscriptions(data.sessionId);
	if (data.webpushSubscription) {
		webpushSubscriptions.set(data.sessionId, {
			sessionId: data.sessionId,
			userId: data.userId,
			subscription: data.webpushSubscription
		});

		await upsertSubscription(data.sessionId, data.userId, 'webpush', data.webpushSubscription);
	}
	if (data.ntfySubscription) {
		ntfySubscriptions.set(data.sessionId, {
			sessionId: data.sessionId,
			userId: data.userId,
			subscription: data.ntfySubscription
		});

		await upsertSubscription(data.sessionId, data.userId, 'ntfy', data.ntfySubscription);
	}
	if (data.fcmSubscription) {
		fcmSubscriptions.set(data.sessionId, {
			sessionId: data.sessionId,
			userId: data.userId,
			subscription: data.fcmSubscription
		});

		await upsertSubscription(data.sessionId, data.userId, 'fcm', data.fcmSubscription);
	}
}

/** `type` is updated too, so a session that switches provider doesn't keep the old one. */
async function upsertSubscription(
	sessionId: string,
	userId: string,
	type: 'webpush' | 'ntfy' | 'fcm',
	subscription: PushSubscription | string
) {
	await db.notificationSubscription.upsert({
		where: { sessionId },
		create: { sessionId, userId, type, data: subscription },
		update: { type, data: subscription }
	});
}

async function deleteSubscription(sessionId: string) {
	try {
		clearSessionSubscriptions(sessionId);
		await db.notificationSubscription.delete({ where: { sessionId } });
	} catch (e) {}
}

async function loadSubscriptions() {
	const subscriptions = await db.notificationSubscription.findMany();

	for (const sub of subscriptions) {
		if (sub.type === 'webpush') {
			webpushSubscriptions.set(sub.sessionId, {
				sessionId: sub.sessionId,
				userId: sub.userId,
				subscription: sub.data as unknown as PushSubscription
			});
		} else if (sub.type === 'ntfy') {
			ntfySubscriptions.set(sub.sessionId, {
				sessionId: sub.sessionId,
				userId: sub.userId,
				subscription: sub.data as string
			});
		} else if (sub.type === 'fcm') {
			fcmSubscriptions.set(sub.sessionId, {
				sessionId: sub.sessionId,
				userId: sub.userId,
				subscription: sub.data as string
			});
		}
	}
}

async function getChatUsers(chatId: string) {
	// TODO: Add some caching to this
	const chat = await db.chat.findUnique({
		where: { id: chatId },
		include: {
			participants: {
				include: {
					user: {
						select: {
							id: true,
							username: true
						}
					}
				}
			}
		}
	});

	return (
		chat?.participants.map((p) => ({
			id: p.user.id,
			username: p.user.username
		})) || []
	);
}

export interface SocketSessionData {
	userId: string;
	sessionId: string;
	socketId: string;
	userActive: boolean; // Whether the user hast the app in the foreground or not
	/** Last time the client confirmed foreground, via 'active' or its periodic heartbeat */
	lastActiveAt: number;
}

export type UserPresence = 'active' | 'background' | 'offline';

/** What other users get to see: only the foreground state, never 'background' */
export type ClientPresence = 'online' | 'offline';

const VERIFY_RATE_LIMIT = 5;
const VERIFY_RATE_WINDOW_MS = 30_000;

/**
 * How long an 'active' claim stays valid without a heartbeat. 2.5x the client's 60s
 * heartbeat, so a client that dies without disconnecting (laptop sleep, killed PWA)
 * stops blocking its owner's push notifications instead of blocking them forever.
 */
const ACTIVE_TTL_MS = 150_000;
const PRESENCE_SWEEP_MS = 30_000;
const PEERS_CACHE_TTL_MS = 30_000;

globalThis._io ??= null;
// Keyed by socket.id, NOT by sessionId: a session cookie is shared by every tab of a
// browser, so keying by session made only the newest tab reachable and let a dying
// socket's late disconnect delete the entry of an already-reconnected live socket.
globalThis._socketMap ??= new Map<string, SocketSessionData>();
globalThis._presenceCache ??= new Map<string, ClientPresence>();
globalThis._presenceSweeper ??= null;

export function getIO(): Server {
	if (!globalThis._io) throw new Error('Socket not initialized');
	return globalThis._io;
}

function getUserSocketData(userId: string): SocketSessionData[] {
	if (!globalThis._socketMap) throw new Error('User socket map not initialized');
	return Array.from(globalThis._socketMap.values()).filter((s) => s.userId === userId);
}

/**
 * An 'active' flag is only trusted while the heartbeat behind it is fresh. Without the
 * TTL a single stale foreground socket suppressed push notifications on every one of
 * that user's devices, indefinitely.
 */
function isSocketActive(s: SocketSessionData): boolean {
	return s.userActive && Date.now() - s.lastActiveAt < ACTIVE_TTL_MS;
}

export function getUserSockets(userId: string): string[] {
	return getUserSocketData(userId).map((s) => s.socketId);
}

export function hasUserActiveSockets(userId: string): boolean {
	return getUserSocketData(userId).some(isSocketActive);
}

/** Whether the user has the app open in the foreground, open in the background, or not at all */
export function getUserPresence(userId: string): UserPresence {
	const sockets = getUserSocketData(userId);
	if (sockets.length === 0) return 'offline';
	return sockets.some(isSocketActive) ? 'active' : 'background';
}

function getClientPresence(userId: string): ClientPresence {
	return getUserPresence(userId) === 'active' ? 'online' : 'offline';
}

const peersCache = new Map<string, { userIds: string[]; expiresAt: number }>();

/** Every user sharing at least one chat with `userId` — the only ones allowed to see its presence */
async function getPresencePeers(userId: string): Promise<string[]> {
	const cached = peersCache.get(userId);
	if (cached && cached.expiresAt > Date.now()) return cached.userIds;

	const rows = await db.chatParticipant.findMany({
		where: { chat: { participants: { some: { userId } } } },
		select: { userId: true }
	});

	const userIds = [...new Set(rows.map((r) => r.userId))].filter((id) => id !== userId);
	peersCache.set(userId, { userIds, expiresAt: Date.now() + PEERS_CACHE_TTL_MS });
	return userIds;
}

/**
 * Tells everyone who shares a chat with `userId` that their online state changed.
 * No-ops when the value is unchanged, so the multi-tab connect/disconnect churn of a
 * single user does not turn into a broadcast storm.
 */
async function broadcastPresence(userId: string): Promise<void> {
	const presence = getClientPresence(userId);
	if (globalThis._presenceCache.get(userId) === presence) return;
	globalThis._presenceCache.set(userId, presence);

	const io = globalThis._io;
	if (!io) return;

	for (const peerId of await getPresencePeers(userId)) {
		for (const socketId of getUserSockets(peerId)) {
			io.to(socketId).emit('user-presence', { userId, presence });
		}
	}
}

/**
 * Catches the transitions no client event announces: an 'active' socket whose heartbeat
 * ran out. Without this the peer's dot would stay lit until that socket disconnects.
 */
function startPresenceSweeper(): void {
	if (globalThis._presenceSweeper) clearInterval(globalThis._presenceSweeper);
	globalThis._presenceSweeper = setInterval(() => {
		const userIds = new Set(
			Array.from(globalThis._socketMap.values())
				.filter((s) => s.userActive && !isSocketActive(s))
				.map((s) => s.userId)
		);
		for (const userId of userIds) void broadcastPresence(userId);

		// Users with no sockets left can never transition again; drop them so the cache
		// does not grow for the lifetime of the process.
		for (const userId of globalThis._presenceCache.keys()) {
			if (getUserSockets(userId).length === 0) globalThis._presenceCache.delete(userId);
		}
	}, PRESENCE_SWEEP_MS);
}

export async function initializeSocket(server: HTTPServer) {
	globalThis._io = new Server(server);
	const io: Server = globalThis._io;

	io.use(async (socket: AuthenticatedSocket, next) => {
		try {
			const cookies = socket.handshake.headers.cookie;
			if (!cookies) {
				return next(new Error('No cookies found'));
			}

			const sessionMatch = cookies.match(/session=([^;]+)/);
			if (!sessionMatch) {
				return next(new Error('No session cookie found'));
			}

			const sessionId = decodeURIComponent(sessionMatch[1]);

			const session = await validateSession(sessionId);
			if (!session) {
				return next(new Error('Invalid session'));
			}

			socket.user = { username: session.user.username, id: session.user.id, sessionId: sessionId };
			console.log(`User authenticated: ${session.user.username} (${session.user.id})`);

			next();
		} catch (error) {
			console.error('Socket authentication error:', error);
			next(new Error('Authentication failed'));
		}
	});

	console.log('Socket server initialized with authentication');

	await loadSubscriptions();

	startPresenceSweeper();

	io.engine.on('connection_error', (err) => {
		console.log('Connection error on server:', err.message);
	});

	io.on('connection', (socket: AuthenticatedSocket) => {
		if (socket.user) {
			// Starts inactive: the socket is now connected on every authenticated page, and only
			// the chat page reports itself as foreground. Keeps push notification behaviour intact.
			globalThis._socketMap.set(socket.id, {
				userId: socket.user.id,
				sessionId: socket.user.sessionId,
				socketId: socket.id,
				userActive: false,
				lastActiveAt: 0
			});
			// The new socket cannot see presence changes it missed while disconnected, but it
			// does need its own state published (a reconnect below the sweep interval).
			void broadcastPresence(socket.user.id);
		}

		console.log('User connected:', socket.id, 'User:', socket.user?.username);

		socket.on('join-chat', (chatId: string) => {
			socket.join(chatId);
			console.log(`User ${socket.id} joined chat ${chatId}`);
		});

		socket.on('leave-chat', (chatId: string) => {
			socket.leave(chatId);
			console.log(`User ${socket.id} left chat ${chatId}`);
		});

		// Mutated in place rather than re-set, so a late event from a dead socket cannot
		// resurrect an entry that disconnect already removed.
		socket.on('inactive', () => {
			console.log(`User ${socket.id} inactive`);
			const entry = globalThis._socketMap.get(socket.id);
			if (entry) entry.userActive = false;
			void broadcastPresence(socket.user!.id);
		});

		// Doubles as the client's foreground heartbeat: re-sent every 60s while active, which
		// is what keeps isSocketActive() true.
		socket.on('active', () => {
			const entry = globalThis._socketMap.get(socket.id);
			if (!entry) return;
			const wasActive = isSocketActive(entry);
			entry.userActive = true;
			entry.lastActiveAt = Date.now();
			if (!wasActive) {
				console.log(`User ${socket.id} active`);
				void broadcastPresence(socket.user!.id);
			}
		});

		socket.on(
			'get-presence',
			async (
				userIds: string[],
				ack?: (res: Record<string, ClientPresence>) => void
			): Promise<void> => {
				if (!ack) return;
				if (!Array.isArray(userIds)) return ack({});

				// Filtered to peers so presence cannot be probed for arbitrary accounts.
				const peers = new Set(await getPresencePeers(socket.user!.id));
				const result: Record<string, ClientPresence> = {};
				for (const userId of userIds) {
					if (peers.has(userId)) result[userId] = getClientPresence(userId);
				}
				ack(result);
			}
		);

		socket.on('subscribe-webpush', (data) => {
			const userId = socket.user!.id;
			console.log(`User ${userId} subscribed to push notifications`);
			saveSubscription({
				sessionId: socket.user!.sessionId,
				userId,
				webpushSubscription: data.subscription
			});
		});

		socket.on('subscribe-ntfy-push', (data) => {
			const userId = socket.user!.id;
			console.log(`User ${userId} subscribed to ntfy push notifications`);
			saveSubscription({
				sessionId: socket.user!.sessionId,
				userId,
				ntfySubscription: data.topic
			});
		});

		socket.on('subscribe-fcm-push', (data) => {
			const userId = socket.user!.id;
			console.log(`User ${userId} subscribed to fcm push notifications`);
			saveSubscription({
				sessionId: socket.user!.sessionId,
				userId,
				fcmSubscription: data.token
			});
		});

		// A verification request pops a modal on every device of the target, so it is worth
		// a cheap per-socket cap.
		const verifyRequestTimes: number[] = [];

		function isVerifyRateLimited(): boolean {
			const now = Date.now();
			while (verifyRequestTimes.length > 0 && now - verifyRequestTimes[0] > VERIFY_RATE_WINDOW_MS) {
				verifyRequestTimes.shift();
			}
			if (verifyRequestTimes.length >= VERIFY_RATE_LIMIT) return true;
			verifyRequestTimes.push(now);
			return false;
		}

		socket.on(
			'request-user-verify',
			(data: { requestId: string; userId: string }, ack?: (res: { status: string }) => void) => {
				console.log('Requesting user verification');

				if (isVerifyRateLimited()) {
					ack?.({ status: 'rate-limited' });
					return;
				}

				const presence = getUserPresence(data.userId);

				// The requester now learns the peer is unreachable instead of waiting forever.
				if (presence === 'offline') {
					ack?.({ status: 'offline' });
					return;
				}

				for (const socketId of getUserSockets(data.userId)) {
					io.to(socketId).emit('requested-user-verify', {
						requestId: data.requestId,
						// Never taken from the payload: the sender does not get to name themselves.
						requestorId: socket.user!.id,
						requestorUsername: socket.user!.username
					});
				}

				ack?.({ status: presence === 'active' ? 'delivered' : 'background' });
			}
		);

		socket.on(
			'respond-user-verify',
			(data: { requestId: string; toUserId: string; response: string }) => {
				for (const socketId of getUserSockets(data.toUserId)) {
					io.to(socketId).emit('user-verify-response', {
						requestId: data.requestId,
						responderId: socket.user!.id,
						responderUsername: socket.user!.username,
						response: data.response
					});
				}

				// Dismiss the duplicate request modal on this user's other devices.
				for (const socketId of getUserSockets(socket.user!.id)) {
					if (socketId === socket.id) continue;
					io.to(socketId).emit('user-verify-handled', { requestId: data.requestId });
				}
			}
		);

		socket.on('cancel-user-verify', (data: { requestId: string; userId: string }) => {
			for (const socketId of getUserSockets(data.userId)) {
				io.to(socketId).emit('user-verify-cancelled', { requestId: data.requestId });
			}
		});

		// 'key-rotated' is emitted by the rotateChatKey remote function, which has already
		// checked chat ownership. The old client relay accepted any chatId from any user.

		socket.on(
			'send-message',
			async (data: {
				chatId: string;
				keyVersion: number;
				encryptedContent: string;
				replyToId?: string | null;
				attachmentPaths?: string[];
			}) => {
				const MAX_BASE64_LENGTH = 64 * 1024; // 64 KB

				if (data.encryptedContent.length > MAX_BASE64_LENGTH) {
					socket.emit('message-error', { error: 'Message too large' });
					return;
				}

				try {
					console.log('Received message from: ' + socket.user!.id + ' in chat: ' + data.chatId);
					const chatUsers = await getChatUsers(data.chatId);

					if (!chatUsers.some((user) => user.id === socket.user!.id)) {
						return;
					}

					const newMessage = await db.message.create({
						data: {
							chatId: data.chatId,
							usedKeyVersion: data.keyVersion,
							senderId: socket.user!.id,
							encryptedContent: data.encryptedContent,
							attachmentPaths: data.attachmentPaths || [],
							encryptedReactions: [],
							replyToId: data.replyToId
						},
						include: {
							user: true,
							chat: true,
							readBy: true,
							replyTo: {
								include: {
									user: true
								}
							}
						}
					});

					await db.chat.update({
						where: {
							id: data.chatId
						},
						data: {
							lastMessageAt: new Date()
						}
					});

					io.to(data.chatId).emit('new-message', newMessage);

					console.log('Sending push notifications (users in chat: ' + chatUsers.length + ')');
					for (const user of chatUsers) {
						const userSocketIds = getUserSockets(user.id);
						if (userSocketIds.length !== 0) {
							for (const userSocketId of userSocketIds) {
								io.to(userSocketId).emit('new-message-notify', {
									chatId: data.chatId,
									chatName: newMessage.chat.name,
									username: newMessage.user.username
								});
							}
						}

						if (user.id === socket.user!.id) continue; // Don't notify the sender
						if (hasUserActiveSockets(user.id)) {
							console.log('User @' + user.username + ' has active sockets, skipping notification');
							continue;
						} // Don't notify users that are currently in the app

						const userSubs = getUserSubscriptions(user.id);

						const notificationData: NotificationDate = {
							groupType: newMessage.chat.type === 'group' ? 'group' : 'dm',
							username: newMessage.user.username,
							chatId: newMessage.chat.id,
							timestamp: newMessage.timestamp.getTime(),
							imageUrl: getImageUrl(
								newMessage.chat.type === 'group'
									? newMessage.chat.imagePath
									: newMessage.user.profilePicPath
							),
							chatName: newMessage.chat.name || undefined
						};

						for (const subscription of userSubs.webpushSubs) {
							const success = await sendWebpushNotification(
								webpush,
								subscription.subscription,
								notificationData
							);
							if (!success) {
								await deleteSubscription(subscription.sessionId);
							}
						}

						for (const ntfyTopic of userSubs.ntfySubs) {
							await sendNtfyNotification(ntfyTopic.subscription, notificationData);
						}

						for (const fcmSub of userSubs.fcmSubs) {
							const result = await sendFcmNotification(fcmSub.subscription, notificationData);
							if (result.invalidToken) {
								await deleteSubscription(fcmSub.sessionId);
							}
						}
					}
				} catch (error) {
					console.error('Error saving message:', error);
					socket.emit('message-error', { error: 'Failed to send message' });
				}
			}
		);

		socket.on(
			'edit-message',
			async (data: { messageId: string; encryptedContent: string; keyVersion: number }) => {
				try {
					const updatedMessage = await db.message.update({
						where: {
							id: data.messageId,
							senderId: socket.user!.id // Ensure user owns the message
						},
						data: {
							usedKeyVersion: data.keyVersion,
							encryptedContent: data.encryptedContent,
							readBy: {
								set: [] // Clear read status on edit
							},
							isEdited: true
						},
						include: {
							user: true,
							chat: true,
							readBy: true,
							replyTo: {
								include: {
									user: true
								}
							}
						}
					});

					io.to(updatedMessage.chatId).emit('message-updated', {
						message: updatedMessage,
						type: 'edit'
					});
				} catch (error) {
					console.error('Error editing message:', error);
					socket.emit('message-error', { error: 'Failed to edit message' });
				}
			}
		);

		socket.on('delete-message', async (data: { messageId: string; chatId: string }) => {
			try {
				const message = await db.message.findUnique({
					where: { id: data.messageId, senderId: socket.user!.id },
					select: { attachmentPaths: true }
				});

				if (!message) return;

				for (const attachment of message.attachmentPaths) {
					try {
						await removeFile(attachment);
					} catch (error) {
						console.error('Error deleting attachment:', error);
					}
				}

				await db.message.delete({
					where: {
						id: data.messageId,
						senderId: socket.user!.id
					}
				});

				io.to(data.chatId).emit('message-deleted', data.messageId);
			} catch (error) {
				console.error('Error deleting message:', error);
				socket.emit('message-error', { error: 'Failed to delete message' });
			}
		});

		socket.on(
			'react-to-message',
			async (data: { messageId: string; encryptedReaction: string }) => {
				try {
					const message = await db.message.findUnique({
						where: { id: data.messageId },
						select: { encryptedReactions: true }
					});

					if (!message) return;

					const reactionKey = `${socket.user!.id}:${data.encryptedReaction}`;

					if (message.encryptedReactions.includes(reactionKey)) {
						return;
					}

					console.log('Adding reaction:', reactionKey);
					const updatedMessage = await db.message.update({
						where: { id: data.messageId },
						data: {
							encryptedReactions: {
								push: reactionKey
							}
						},
						include: {
							user: true,
							chat: true,
							readBy: true
						}
					});

					io.to(updatedMessage.chatId).emit('message-updated', {
						message: updatedMessage,
						type: 'reaction'
					});
				} catch (error) {
					console.error('Error updating reaction:', error);
				}
			}
		);

		socket.on(
			'update-reaction',
			async (data: {
				messageId: string;
				encryptedReaction: string;
				operation: 'add' | 'remove';
			}) => {
				try {
					const message = await db.message.findUnique({
						where: { id: data.messageId },
						select: { encryptedReactions: true }
					});

					if (!message) return;

					const userReaction = `${socket.user!.id}:${data.encryptedReaction}`;
					let updatedReactions = message.encryptedReactions ?? [];

					if (data.operation === 'add') {
						if (!updatedReactions.includes(userReaction)) {
							updatedReactions = [...updatedReactions, userReaction];
						}
					} else if (data.operation === 'remove') {
						updatedReactions = updatedReactions.filter((r) => r !== userReaction);
					}

					const updatedMessage = await db.message.update({
						where: { id: data.messageId },
						data: {
							encryptedReactions: {
								set: updatedReactions
							}
						},
						include: {
							user: true,
							chat: true,
							readBy: true
						}
					});

					console.log('Updated reactions, current:', updatedMessage.encryptedReactions.length);

					io.to(updatedMessage.chatId).emit('message-updated', {
						message: updatedMessage,
						type: 'reaction'
					});
				} catch (error) {
					console.error('Error updating reaction:', error);
				}
			}
		);

		socket.on('mark-messages-read', async (data: { messageIds: string[]; chatId: string }) => {
			try {
				await Promise.all(
					data.messageIds.map((messageId) =>
						db.message.update({
							where: {
								id: messageId,
								chatId: data.chatId
							},
							data: {
								readBy: {
									connect: { id: socket.user!.id }
								}
							}
						})
					)
				);

				io.to(data.chatId).emit('messages-read', {
					messageIds: data.messageIds,
					userId: socket.user!.id
				});
			} catch (error) {
				console.error('Error marking messages as read:', error);
			}
		});

		socket.on('typing-start', (data: { chatId: string; username: string }) => {
			socket.to(data.chatId).emit('user-typing', {
				userId: socket.user!.id,
				username: data.username,
				isTyping: true
			});
		});

		socket.on('typing-stop', (data: { chatId: string }) => {
			socket.to(data.chatId).emit('user-typing', {
				userId: socket.user!.id,
				isTyping: false
			});
		});

		// 'new-chat-created' is emitted by createDm / createGroup / addUserToChat, which derive
		// the recipients from the DB. The old client relay accepted an arbitrary chatId and an
		// arbitrary recipient list from any authenticated user.

		socket.on('disconnect', () => {
			// Scoped to this socket only. Deleting by sessionId meant a dying socket's late
			// disconnect (pingTimeout fires ~20s after a silent transport drop) wiped the entry
			// of the socket that had already reconnected, silently dropping every user-targeted
			// event until the next reconnect.
			globalThis._socketMap.delete(socket.id);
			if (socket.user) void broadcastPresence(socket.user.id);
			console.log('User disconnected:', socket.id);
		});
	});

	return io;
}
