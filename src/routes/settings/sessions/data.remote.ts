import { command, getRequestEvent, query } from '$app/server';
import { db } from '$lib/db';
import { validateSession } from '$lib/utils/auth';
import { error } from 'console';
import * as v from 'valibot';

export const getSessions = query(async () => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	try {
		const sessions = await db.session.findMany({
			where: {
				userId: locals.user!.id
			}
		});

		return sessions;
	} catch (err) {
		error(500, 'Something went wrong');
	}
});

export const getCurrentSessionId = query(async () => {
	const { locals, cookies } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const sessionId = cookies.get('session');

	return sessionId;
});

export const logoutSession = command(v.string(), async (sessionId: string) => {
	const { locals } = getRequestEvent();

	if (!locals.sessionId) {
		error(401, 'Unauthorized');
	}

	const userSession = await validateSession(locals.sessionId!);

	if (!userSession) {
		error(401, 'Unauthorized');
	}

	try {
		await db.session.delete({
			where: { id: sessionId }
		});
	} catch (err) {
		error(500, 'Something went wrong');
	}
});
