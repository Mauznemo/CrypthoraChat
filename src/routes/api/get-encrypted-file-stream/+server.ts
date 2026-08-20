import { errorResponse, getUploadDir, validateAttachmentPath } from '$lib/server/fileUpload';
import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { db } from '$lib/db';

/**
 * Decides whether a user may read a file, from where it sits under the uploads root.
 *
 * Fail-closed: a location this does not recognise is refused. The previous version regex-matched
 * `/media/<uuid>/` and skipped authorization entirely when the pattern did not hit, which meant
 * every user sticker - and anything ever added under a new directory - was readable by any
 * account that could name the path.
 */
async function canRead(absolutePath: string, userId: string): Promise<boolean> {
	const relative = path.relative(path.resolve(getUploadDir()), absolutePath);
	const segments = relative.split(path.sep);

	// media/<chatId>/<file>: readable by the participants of that chat.
	if (segments[0] === 'media' && segments.length > 2) {
		const chat = await db.chat.findUnique({
			where: { id: segments[1] },
			select: { participants: { select: { userId: true } } }
		});
		return chat?.participants.some((p) => p.userId === userId) ?? false;
	}

	// users/<userId>/stickers/<file>: a private sticker library, readable only by its owner.
	// Sending a sticker to a chat uploads a copy into that chat's media directory, so no one
	// else ever needs to read out of here.
	if (segments[0] === 'users' && segments[2] === 'stickers' && segments.length > 3) {
		return segments[1] === userId;
	}

	return false;
}

export const GET: RequestHandler = async ({ url, locals, request }) => {
	if (!locals.sessionId) {
		throw error(401, 'Unauthorized');
	}

	const filePath = url.searchParams.get('filePath');
	if (!filePath) {
		return errorResponse(400, 'Missing filePath parameter');
	}

	const validation = validateAttachmentPath(filePath);
	if (!validation.ok) {
		return errorResponse(403, 'Access denied: Invalid file path');
	}

	const fullPath = validation.absolute;

	try {
		if (!(await canRead(fullPath, locals.user!.id))) {
			return errorResponse(403, 'Access denied');
		}
	} catch {
		return errorResponse(403, 'Access denied');
	}

	try {
		await fs.access(fullPath);
	} catch {
		return errorResponse(404, 'File not found');
	}

	const stats = await fs.stat(fullPath);
	const range = request.headers.get('range');

	// helper to build stream with abort handling
	const makeStreamResponse = (
		nodeStream: Readable,
		headers: Record<string, string>,
		status = 200
	) => {
		// Abort if client disconnects
		const abortSignal = request.signal;
		if (abortSignal?.aborted) {
			nodeStream.destroy();
		} else {
			abortSignal?.addEventListener('abort', () => {
				nodeStream.destroy();
			});
		}

		const webStream = nodeStreamToWebStream(nodeStream);
		return new Response(webStream, { status, headers });
	};

	if (range) {
		const parts = range.replace(/bytes=/, '').split('-');
		const start = parseInt(parts[0], 10);
		const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;

		const nodeStream = createReadStream(fullPath, { start, end });

		return makeStreamResponse(
			nodeStream,
			{
				'Content-Range': `bytes ${start}-${end}/${stats.size}`,
				'Accept-Ranges': 'bytes',
				'Content-Length': (end - start + 1).toString(),
				'Content-Type': 'application/octet-stream'
			},
			206
		);
	}

	const nodeStream = createReadStream(fullPath);

	return makeStreamResponse(nodeStream, {
		'Content-Length': stats.size.toString(),
		'Content-Type': 'application/octet-stream'
	});
};

function nodeStreamToWebStream(nodeStream: Readable): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			nodeStream.on('data', (chunk: Buffer) => {
				controller.enqueue(new Uint8Array(chunk));
			});
			nodeStream.on('end', () => {
				controller.close();
			});
			nodeStream.on('error', (err) => {
				controller.error(err);
			});
		},
		cancel() {
			nodeStream.destroy();
		}
	});
}
