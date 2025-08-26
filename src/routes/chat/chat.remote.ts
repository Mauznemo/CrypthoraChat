import { command, getRequestEvent, query } from '$app/server';
import { db } from '$lib/db';
import { safeUserFields } from '$lib/types';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';

// Simple in-memory cache - might want to use Redis or another cache in production
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const getUserById = query(v.string(), async (userId) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const cached = userCache.get(userId);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return cached.user;
	}

	const user = await db.user.findUnique({
		where: { id: userId },
		select: safeUserFields
	});

	if (!user) {
		error(404, 'User not found');
	}

	userCache.set(userId, {
		user,
		timestamp: Date.now()
	});

	return user;
});

export const getMessagesByChatId = query(v.string(), async (chatId) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const messages = await db.message.findMany({
		where: { chatId },
		orderBy: { timestamp: 'asc' },
		include: {
			user: { select: safeUserFields },
			chat: true,
			readBy: { select: safeUserFields },
			replyTo: { include: { user: { select: safeUserFields } } }
		}
	});

	// Mark all messages as read
	if (locals.user?.id) {
		const messageIds = messages.map((message) => message.id);

		await db.user.update({
			where: { id: locals.user.id },
			data: {
				readMessages: {
					connect: messageIds.map((id) => ({ id }))
				}
			}
		});
	}

	console.log('Queried messages: ', messages.length);

	return messages;
});
