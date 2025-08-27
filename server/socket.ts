// server/socket.ts or in your main server file
import { Server, Socket } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { db } from '../src/lib/db';
import { validateSession } from '$lib/auth';
import webpush from 'web-push';
import { PUBLIC_VAPID_KEY } from '$env/static/public';
import { VAPID_EMAIL, VAPID_PRIVATE_KEY } from '$env/static/private';

interface AuthenticatedSocket extends Socket {
	user?: {
		id: string;
		username: string;
	};
}

webpush.setVapidDetails(`mailto:${VAPID_EMAIL}`, PUBLIC_VAPID_KEY, VAPID_PRIVATE_KEY);

const pushSubscriptions = new Map<string, any>(); // TODO: use database later

async function getChatUsers(chatId: string) {
	// TODO: Add some caching to this
	const chat = await db.chat.findUnique({
		where: { id: chatId },
		include: { participants: { select: { id: true, username: true } } }
	});
	return chat?.participants || [];
}

export function initializeSocket(server: HTTPServer) {
	const io = new Server(server);

	// Add this map after io initialization
	const userSocketMap = new Map<string, string>();

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
			userSocketMap.set(socket.user.id, socket.id);
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

		socket.on('subscribe-push', (data) => {
			const userId = socket.user!.id;
			console.log(`User ${userId} subscribed to push notifications`);
			pushSubscriptions.set(userId, data.subscription);
		});

		// Handle new message
		socket.on(
			'send-message',
			async (data: {
				chatId: string;
				//senderId: string;
				encryptedContent: string;
				replyToId?: string | null;
				attachments?: string[];
			}) => {
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
							senderId: socket.user!.id,
							encryptedContent: data.encryptedContent,
							attachments: data.attachments || [],
							reactions: [],
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

					// Emit to all users in the chat room
					io.to(data.chatId).emit('new-message', newMessage);

					//TODO: Send websocket notification to users in chat, but nit currently joined, otherwise send notification
					console.log('Sending push notifications to users: ' + chatUsers.length);
					for (const user of chatUsers) {
						if (user.id !== socket.user!.id) {
							const subscription = pushSubscriptions.get(user.id);
							if (subscription) {
								try {
									console.log('Sending push notification to user: ' + user.id);
									await webpush.sendNotification(
										subscription,
										JSON.stringify({
											title: 'New Message',
											message: 'You have a new message!',
											chatId: data.chatId,
											chatType: newMessage.chat.type,
											chatName: newMessage.chat.name,
											senderName: newMessage.user.displayName
										})
									);
								} catch (error) {
									console.error('Error sending push notification:', error);
									// Remove invalid subscription
									pushSubscriptions.delete(user.id);
								}
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
		socket.on('edit-message', async (data: { messageId: string; encryptedContent: string }) => {
			try {
				// Verify user owns the message and update it
				const updatedMessage = await db.message.update({
					where: {
						id: data.messageId,
						senderId: socket.user!.id // Ensure user owns the message
					},
					data: {
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
				io.to(updatedMessage.chatId).emit('message-updated', updatedMessage);
			} catch (error) {
				console.error('Error editing message:', error);
				socket.emit('message-error', { error: 'Failed to edit message' });
			}
		});

		// Handle message deletion
		socket.on('delete-message', async (data: { messageId: string; chatId: string }) => {
			try {
				// Verify user owns the message and update it
				await db.message.delete({
					where: {
						id: data.messageId,
						senderId: socket.user!.id // Ensure user owns the message
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
		socket.on('react-to-message', async (data: { messageId: string; reaction: string }) => {
			try {
				const message = await db.message.findUnique({
					where: { id: data.messageId },
					select: { reactions: true }
				});

				if (!message) return;

				const reactionKey = `${socket.user!.id}:${data.reaction}`;

				if (message.reactions.includes(reactionKey)) {
					return;
				}

				// Add reaction
				const updatedMessage = await db.message.update({
					where: { id: data.messageId },
					data: {
						reactions: {
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
				io.to(updatedMessage.chatId).emit('message-updated', updatedMessage);
			} catch (error) {
				console.error('Error updating reaction:', error);
			}
		});

		socket.on(
			'update-reaction',
			async (data: { messageId: string; reaction: string; operation: 'add' | 'remove' }) => {
				try {
					const message = await db.message.findUnique({
						where: { id: data.messageId },
						select: { reactions: true }
					});

					if (!message) return;

					const userReaction = `${socket.user!.id}:${data.reaction}`;
					let updatedReactions = message.reactions ?? [];

					if (data.operation === 'add') {
						// Prevent duplicates
						if (!updatedReactions.includes(userReaction)) {
							updatedReactions = [...updatedReactions, userReaction];
						}
					} else if (data.operation === 'remove') {
						updatedReactions = updatedReactions.filter((r) => r !== userReaction);
					}

					const updatedMessage = await db.message.update({
						where: { id: data.messageId },
						data: {
							reactions: {
								set: updatedReactions
							}
						},
						include: {
							user: true,
							chat: true,
							readBy: true
						}
					});

					io.to(updatedMessage.chatId).emit('message-updated', updatedMessage);
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

		// Add these new event handlers
		socket.on(
			'chat-created',
			(data: { userIds: string[]; chatId: string; type: 'dm' | 'group' }) => {
				// Find socket IDs for all target users
				const targetSockets = data.userIds
					.map((userId) => userSocketMap.get(userId))
					.filter((socketId): socketId is string => socketId !== undefined);

				// Emit to specific users if we have their sockets
				if (targetSockets.length > 0) {
					targetSockets.forEach((socketId) => {
						io.to(socketId).emit('new-chat-created', {
							chatId: data.chatId,
							type: data.type
						});
					});
				} else {
					// Fallback: broadcast to all with user filter info
					io.emit('new-chat-created', {
						chatId: data.chatId,
						type: data.type,
						forUsers: data.userIds
					});
				}
			}
		);

		socket.on('disconnect', () => {
			// Remove from user socket map
			if (socket.user) {
				userSocketMap.delete(socket.user.id);
			}
			console.log('User disconnected:', socket.id);
		});
	});

	return io;
}
