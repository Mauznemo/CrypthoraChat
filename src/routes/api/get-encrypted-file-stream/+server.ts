import { errorResponse, validateAttachmentPath } from '$lib/server/fileUpload';
import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { db } from '$lib/db';

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

	const chatIdMatch = fullPath.match(/\/media\/([a-f0-9-]{36})\//);
	if (chatIdMatch) {
		const chatId = chatIdMatch[1];
		try {
			const chat = await db.chat.findUnique({
				where: { id: chatId },
				select: { participants: { select: { userId: true } } }
			});

			if (!chat || !chat.participants.some((p) => p.userId === locals.user!.id)) {
				return errorResponse(403, 'Access denied: Not a participant of this chat');
			}
		} catch {
			return errorResponse(403, 'Access denied: Invalid chat');
		}
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
