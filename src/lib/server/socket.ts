import { Server, Socket } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { db } from '../db';
import { validateSession } from '../utils/auth';
import webpush from 'web-push';
import 'dotenv/config';
import { removeFile } from './fileUpload';
import {
	sendNtfyNotification,
	sendWebpushNotification,
	type NotificationDate
} from './pushNotifications';

const VAPID_EMAIL = process.env.VAPID_EMAIL;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const PUBLIC_VAPID_KEY = process.env.PUBLIC_VAPID_KEY;

interface AuthenticatedSocket extends Socket {
	user?: {
		id: string;
		username: string;
	};
}

if (VAPID_EMAIL && VAPID_PRIVATE_KEY && PUBLIC_VAPID_KEY) {
	webpush.setVapidDetails(`mailto:${VAPID_EMAIL}`, PUBLIC_VAPID_KEY, VAPID_PRIVATE_KEY);
}

const webpushSubscriptions = new Map<string, any>(); // TODO: use database later
const ntfySubscriptions = new Map<string, string>(); // TODO: use database later

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

	// Flatten into an array of user objects
	return (
		chat?.participants.map((p) => ({
			id: p.user.id,
			username: p.user.username
		})) || []
	);
}

globalThis._io ??= null;
globalThis._userSocketMap ??= new Map<string, string>();

export function getIO(): Server {
	if (!globalThis._io) throw new Error('Socket not initialized');
	return globalThis._io;
}

export function getUserSocket(userId: string): string | null {
	if (!globalThis._userSocketMap) throw new Error('User socket map not initialized');
	return globalThis._userSocketMap.get(userId) || null;
}

export function initializeSocket(server: HTTPServer) {
	globalThis._io = new Server(server);
	const io: Server = globalThis._io;

	// Authentication middleware
	io.use(async (socket: AuthenticatedSocket, next) => {
		try {
			// Extract session cookie from handshake
			const cookies = socket.handshake.headers.cookie;
			if (!cookies) {
				return next(new Error('No cookies found'));
			}

			// Parse session ID from cookies
			const sessionMatch = cookies.match(/session=([^;]+)/);
			if (!sessionMatch) {
				return next(new Error('No session cookie found'));
			}

			const sessionId = decodeURIComponent(sessionMatch[1]);

			// Validate session using your existing function
			const session = await validateSession(sessionId);
			if (!session) {
				return next(new Error('Invalid session'));
			}

			// Attach user to socket
			socket.user = session.user;
			console.log(`User authenticated: ${session.user.username} (${session.user.id})`);

			next();
		} catch (error) {
			console.error('Socket authentication error:', error);
			next(new Error('Authentication failed'));
		}
	});

	console.log('Socket server initialized with authentication');

	io.engine.on('connection_error', (err) => {
		console.log('Connection error on server:', err.message);
	});

	io.on('connection', (socket: AuthenticatedSocket) => {
		// Add this after connection
		if (socket.user) {
			globalThis._userSocketMap.set(socket.user.id, socket.id);
		}

		console.log('User connected:', socket.id, 'User:', socket.user?.username);
		// Join chat room
		socket.on('join-chat', (chatId: string) => {
			socket.join(chatId);
			console.log(`User ${socket.id} joined chat ${chatId}`);
		});

		// Leave chat room
		socket.on('leave-chat', (chatId: string) => {
			socket.leave(chatId);
			console.log(`User ${socket.id} left chat ${chatId}`);
		});

		socket.on('subscribe-webpush', (data) => {
			const userId = socket.user!.id;
			console.log(`User ${userId} subscribed to push notifications`);
			webpushSubscriptions.set(userId, data.subscription);
		});

		socket.on('subscribe-ntfy-push', (data) => {
			const userId = socket.user!.id;
			console.log(`User ${userId} subscribed to ntfy push notifications`);
			ntfySubscriptions.set(userId, data.topic);
		});

		socket.on('request-user-verify', (data) => {
			const socketId = globalThis._userSocketMap.get(data.userId);
			if (!socketId) {
				return;
			}

			io.to(socketId).emit('requested-user-verify', {
				requestorId: socket.user!.id,
				requestorUsername: socket.user!.username
			});
		});

		socket.on('key-rotated', async (data) => {
			io.to(data.chatId).emit('key-rotated');
		});

		// Handle new message
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

					// Save message to database
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

					// Emit to all users in the chat room
					io.to(data.chatId).emit('new-message', newMessage);

					//TODO: Send websocket notification (not full message, just which chat) to users in a chat, but not currently joined, otherwise send notification
					console.log('Sending push notifications to users: ' + chatUsers.length);
					for (const user of chatUsers) {
						const userSocketId = globalThis._userSocketMap.get(user.id);
						if (userSocketId) {
							io.to(userSocketId).emit('new-message-notify', {
								chatId: data.chatId,
								chatName: newMessage.chat.name,
								username: newMessage.user.username
							});
						}

						if (user.id === socket.user!.id) continue; // Don't notify the sender
						if (globalThis._userSocketMap.has(user.id)) continue; // Don't notify users that are currently in the app

						const subscription = webpushSubscriptions.get(user.id);
						const ntfyTopic = ntfySubscriptions.get(user.id);

						const notificationData: NotificationDate = {
							groupType: newMessage.chat.type === 'group' ? 'group' : 'dm',
							username: newMessage.user.username,
							chatId: newMessage.chat.id,
							chatName: newMessage.chat.name || undefined
						};

						if (subscription) {
							const success = await sendWebpushNotification(
								webpush,
								subscription,
								notificationData
							);
							if (!success) {
								webpushSubscriptions.delete(user.id);
							}
						}

						if (ntfyTopic) {
							const success = await sendNtfyNotification(ntfyTopic, notificationData);
							if (!success) {
								ntfySubscriptions.delete(user.id);
							}
						}
					}
				} catch (error) {
					console.error('Error saving message:', error);
					socket.emit('message-error', { error: 'Failed to send message' });
				}
			}
		);

		// Handle message editing
		socket.on(
			'edit-message',
			async (data: { messageId: string; encryptedContent: string; keyVersion: number }) => {
				try {
					// Verify user owns the message and update it
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

					// Emit to all users in the chat
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

		// Handle message deletion
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

				// Emit to all users in the chat
				io.to(data.chatId).emit('message-deleted', data.messageId);
			} catch (error) {
				console.error('Error deleting message:', error);
				socket.emit('message-error', { error: 'Failed to delete message' });
			}
		});

		// Handle message reactions
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
					// Add reaction
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

					// Emit updated message
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

		// Handle message read status
		socket.on('mark-messages-read', async (data: { messageIds: string[]; chatId: string }) => {
			try {
				// Update read status in database
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

				// Emit read status update
				io.to(data.chatId).emit('messages-read', {
					messageIds: data.messageIds,
					userId: socket.user!.id
				});
			} catch (error) {
				console.error('Error marking messages as read:', error);
			}
		});

		// Handle typing indicators
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

		socket.on(
			'chat-created',
			(data: { userIds: string[]; chatId: string; type: 'dm' | 'group' }) => {
				const targetSockets = data.userIds
					.map((userId) => globalThis._userSocketMap.get(userId))
					.filter((socketId): socketId is string => socketId !== undefined);

				targetSockets.forEach((socketId) => {
					io.to(socketId).emit('new-chat-created', {
						chatId: data.chatId,
						type: data.type
					});
				});
			}
		);

		socket.on('disconnect', () => {
			// Remove from user socket map
			if (socket.user) {
				globalThis._userSocketMap.delete(socket.user.id);
			}
			console.log('User disconnected:', socket.id);
		});
	});

	return io;
}
