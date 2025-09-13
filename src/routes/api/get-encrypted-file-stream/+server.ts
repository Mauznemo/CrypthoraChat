import { errorResponse } from '$lib/utils/fileUpload';
import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';

const UPLOAD_BASE_PATH = (process.env.UPLOAD_PATH || './uploads') + '/media';

export const GET: RequestHandler = async ({ url, locals, request }) => {
	if (!locals.sessionId) {
		throw error(401, 'Unauthorized');
	}

	const filePath = url.searchParams.get('filePath');
	if (!filePath) {
		return errorResponse(400, 'Missing filePath parameter');
	}

	const normalizedPath = path.normalize(filePath);
	const fullPath = path.resolve(normalizedPath);
	const allowedBasePath = path.resolve(UPLOAD_BASE_PATH);

	if (!fullPath.startsWith(allowedBasePath)) {
		return errorResponse(403, 'Access denied: Invalid file path');
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
