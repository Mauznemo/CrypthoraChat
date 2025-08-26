import { command, getRequestEvent } from '$app/server';
import { db } from '$lib/db';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';

const createGroupSchema = v.object({
	groupName: v.pipe(
		v.string('Group name is required'),
		v.minLength(3, 'Group name must be at least 3 characters')
	),

	userIds: v.pipe(
		v.array(v.string(), 'You must provide a list of users.'),
		v.minLength(1, 'You must select at least one user.')
	)
});

export const createGroup = command(createGroupSchema, async ({ groupName, userIds }) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const existingUsersCount = await db.user.count({
		where: {
			id: { in: userIds }
		}
	});

	if (existingUsersCount !== userIds.length) {
		error(400, 'One or more of the selected users do not exist.');
	}

	const allParticipantIds = [...new Set([...userIds, locals.user!.id])];

	await db.chat.create({
		data: {
			name: groupName,
			type: 'group',
			ownerId: locals.user!.id,
			participants: {
				connect: allParticipantIds.map((id) => ({ id }))
			},
			salt: Math.random().toString(36).substring(2, 15) // TODO: maybe change this
		}
	});

	return true;
});

const createDmSchema = v.object({
	userId: v.string('You must select a user.')
});

export const createDm = command(createDmSchema, async ({ userId }) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const userExists =
		(await db.user.count({
			where: {
				id: userId
			}
		})) > 0;

	if (!userExists) {
		error(400, 'The selected user does not exist.');
	}

	const allParticipantIds = [...new Set([userId, locals.user!.id])];

	await db.chat.create({
		data: {
			name: userId,
			type: 'dm',
			ownerId: locals.user!.id,
			participants: {
				connect: allParticipantIds.map((id) => ({ id }))
			},
			salt: Math.random().toString(36).substring(2, 15) // TODO: maybe change this
		}
	});

	return true;
});
