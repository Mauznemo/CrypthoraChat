// server/socket.ts or in your main server file
import { Server, Socket } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { db } from '../src/lib/db';
import { validateSession } from '$lib/auth';

interface AuthenticatedSocket extends Socket {
	user?: {
		id: string;
		username: string;
	};
}

export function initializeSocket(server: HTTPServer) {
	const io = new Server(server);

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
					//TODO: Check if user is in chat
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
				// Update message with reaction in database
				const updatedMessage = await db.message.update({
					where: { id: data.messageId },
					data: {
						reactions: {
							push: `${socket.user!.id}:${data.reaction}`
						}
					},
					include: {
						user: true,
						chat: true,
						readBy: true
					}
				});

				// Emit to all users in the chat
				io.to(updatedMessage.chatId).emit('message-updated', updatedMessage);
			} catch (error) {
				console.error('Error updating reaction:', error);
			}
		});

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

		socket.on('disconnect', () => {
			console.log('User disconnected:', socket.id);
		});
	});

	return io;
}
