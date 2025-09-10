import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import busboy from 'busboy';
import { ensureUploadDir } from '$lib/server/fileUpload';

const UPLOAD_BASE_PATH = (process.env.UPLOAD_PATH || './uploads') + '/media';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.sessionId) {
		throw error(401, 'Unauthorized');
	}

	// Check content type
	const contentType = request.headers.get('content-type');
	if (!contentType?.includes('multipart/form-data')) {
		throw error(400, 'Content-Type must be multipart/form-data');
	}

	return new Promise(async (resolve, reject) => {
		const bb = busboy({
			headers: { 'content-type': contentType },
			limits: {
				fileSize: 100 * 1024 * 1024, // 100MB limit, adjust as needed
				files: 1 // Only allow one file upload
			}
		});

		let chatId: string | null = null;
		let encryptedFileNameBase64: string | null = null;
		let filePath: string | null = null;
		let uploadPromise: Promise<void> | null = null;

		// Handle form fields (non-file data)
		bb.on('field', (name: string, value: string) => {
			if (name === 'chatId') {
				chatId = value;
			} else if (name === 'encryptedFileNameBase64') {
				encryptedFileNameBase64 = value;
			}
		});

		// Handle file uploads
		bb.on('file', async (name: string, file, info) => {
			if (name !== 'encryptedData') {
				file.resume(); // Drain the stream to prevent hanging
				return;
			}

			// Validate required fields are present
			if (!chatId || !encryptedFileNameBase64) {
				file.resume();
				reject(error(400, 'Missing required fields: chatId and encryptedFileNameBase64'));
				return;
			}

			try {
				const relativePath = `/${chatId}`;
				await ensureUploadDir(UPLOAD_BASE_PATH + relativePath);

				const filename = `${randomUUID()}_${encryptedFileNameBase64}.enc`;
				filePath = path.join(UPLOAD_BASE_PATH + relativePath, filename);

				const writeStream = createWriteStream(filePath);

				// Stream the file directly to disk
				uploadPromise = pipeline(file, writeStream);
			} catch (err) {
				file.resume();
				reject(
					error(500, `Failed to setup file upload: ${err instanceof Error ? err.message : err}`)
				);
			}
		});

		// Handle busboy errors
		bb.on('error', (err: Error) => {
			reject(error(400, `Upload parsing error: ${err.message}`));
		});

		// Handle completion
		bb.on('finish', async () => {
			try {
				// Wait for file upload to complete if it was started
				if (uploadPromise) {
					await uploadPromise;
				}

				if (!filePath) {
					reject(error(400, 'No file was uploaded'));
					return;
				}

				resolve(
					new Response(JSON.stringify({ success: true, filePath }), {
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					})
				);
			} catch (err) {
				console.error('Upload error:', err);
				reject(error(500, `Failed to save file: ${err instanceof Error ? err.message : err}`));
			}
		});

		// Convert ReadableStream to Node.js stream and pipe to busboy
		if (request.body) {
			const reader = request.body.getReader();
			const stream = new ReadableStream({
				start(controller) {
					function pump(): Promise<void> {
						return reader.read().then(({ done, value }) => {
							if (done) {
								controller.close();
								return;
							}
							controller.enqueue(value);
							return pump();
						});
					}
					return pump();
				}
			});

			// Convert Web ReadableStream to Node.js Readable
			const nodeStream = new (await import('stream')).Readable({
				read() {}
			});

			const streamReader = stream.getReader();
			const processStream = async () => {
				try {
					while (true) {
						const { done, value } = await streamReader.read();
						if (done) {
							nodeStream.push(null);
							break;
						}
						nodeStream.push(Buffer.from(value));
					}
				} catch (err) {
					nodeStream.destroy(err instanceof Error ? err : new Error(String(err)));
				}
			};

			processStream();
			nodeStream.pipe(bb);
		} else {
			reject(error(400, 'No request body'));
		}
	});
};
