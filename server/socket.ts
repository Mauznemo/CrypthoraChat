// server/socket.ts or in your main server file
import { Server, Socket } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { db } from '../src/lib/db';

export function initializeSocket(server: HTTPServer) {
	const io = new Server(server);
	console.log('Socket server initialized');

	io.engine.on('connection_error', (err) => {
		console.log('Connection error on server:', err.message);
	});

	io.on('connection', (socket: Socket) => {
		console.log('User connected:', socket.id);
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
				senderId: string;
				encryptedContent: string;
				replyToId?: string | null;
				attachments?: string[];
			}) => {
				try {
					// Save message to database
					const newMessage = await db.message.create({
						data: {
							chatId: data.chatId,
							senderId: data.senderId,
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

		// Handle message reactions
		socket.on(
			'react-to-message',
			async (data: { messageId: string; reaction: string; userId: string }) => {
				try {
					// Update message with reaction in database
					const updatedMessage = await db.message.update({
						where: { id: data.messageId },
						data: {
							reactions: {
								push: `${data.userId}:${data.reaction}`
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
			}
		);

		// Handle message read status
		socket.on(
			'mark-messages-read',
			async (data: { messageIds: string[]; userId: string; chatId: string }) => {
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
										connect: { id: data.userId }
									}
								}
							})
						)
					);

					// Emit read status update
					io.to(data.chatId).emit('messages-read', {
						messageIds: data.messageIds,
						userId: data.userId
					});
				} catch (error) {
					console.error('Error marking messages as read:', error);
				}
			}
		);

		// Handle typing indicators
		socket.on('typing-start', (data: { chatId: string; userId: string; username: string }) => {
			socket.to(data.chatId).emit('user-typing', {
				userId: data.userId,
				username: data.username,
				isTyping: true
			});
		});

		socket.on('typing-stop', (data: { chatId: string; userId: string }) => {
			socket.to(data.chatId).emit('user-typing', {
				userId: data.userId,
				isTyping: false
			});
		});

		socket.on('disconnect', () => {
			console.log('User disconnected:', socket.id);
		});
	});

	return io;
}
