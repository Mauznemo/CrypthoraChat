import { command, getRequestEvent, query } from '$app/server';
import { db } from '$lib/db';
import type { Prisma } from '$prisma';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';

// Simple in-memory cache - might want to use Redis or another cache in production
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const getUserById = query(v.string(), async (userId) => {
	const { cookies, locals } = getRequestEvent();

	// Check cache first
	const cached = userCache.get(userId);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return cached.user;
	}

	// Fetch from database
	const user = await db.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			username: true,
			displayName: true,
			password: true,
			profilePic: true,
			profileIv: true,
			isAdmin: true,
			createdAt: true
		}
	});

	if (!user) {
		throw error(404, 'User not found');
	}

	// Cache the result
	userCache.set(userId, {
		user,
		timestamp: Date.now()
	});

	return user;
});

export const testQuery = query(async () => {
	let buffer = Buffer.from('Hello World!');
	console.log('Buffer: ', buffer);
	console.log('Buffer Length: ', buffer.length);
	return buffer;
});

export const getMessagesByChatId = query(v.string(), async (chatId) => {
	const { locals } = getRequestEvent();

	// First, get all messages
	const messages = await db.message.findMany({
		where: { chatId },
		orderBy: { timestamp: 'asc' },
		include: { user: true, chat: true, readBy: true }
	});

	// If user is logged in, mark all messages as read
	if (locals.user?.id) {
		const messageIds = messages.map((message) => message.id);

		// Update all messages to include current user in readBy relation
		await db.user.update({
			where: { id: locals.user.id },
			data: {
				readMessages: {
					connect: messageIds.map((id) => ({ id }))
				}
			}
		});
	}

	// Return the messages (the readBy relation will be updated for subsequent queries)
	return messages;
});
