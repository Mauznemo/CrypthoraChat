import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import busboy from 'busboy';
import {
	ensureUploadDir,
	errorResponse,
	getUploadDir,
	removeFile,
	validateUploadPath
} from '$lib/server/fileUpload';
import { db } from '$lib/db';

const UPLOAD_BASE_PATH = getUploadDir();
const UPLOAD_SIZE_LIMIT = parseInt(process.env.UPLOAD_SIZE_LIMIT || '104857600');

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.sessionId) {
		throw error(401, 'Unauthorized');
	}

	const contentType = request.headers.get('content-type');
	if (!contentType?.includes('multipart/form-data')) {
		throw error(400, 'Content-Type must be multipart/form-data');
	}

	return new Promise(async (resolve, reject) => {
		const bb = busboy({
			headers: { 'content-type': contentType },
			limits: {
				fileSize: UPLOAD_SIZE_LIMIT,
				files: 1
			}
		});

		let type: string | null = null;
		let fileExtension: string | null = null;
		let chatId: string | null = null;
		let encryptedFileNameSafeBase64: string | null = null;
		let filePath: string | null = null;
		let uploadPromise: Promise<void> | null = null;
		let limitExceeded = false;
		let isAborted = false;

		const cleanup = async () => {
			if (filePath && !limitExceeded) {
				try {
					await removeFile(filePath);
				} catch (err) {
					console.warn('Could not clean up file:', filePath, err);
				}
			}
		};

		const handleAbort = () => {
			if (isAborted) return;
			isAborted = true;
			console.log('Upload aborted by client');
			cleanup().finally(() => {
				resolve(errorResponse(400, 'Upload aborted'));
			});
		};

		bb.on('field', (name: string, value: string) => {
			if (name === 'type') {
				type = value;
			} else if (name === 'fileExtension') {
				fileExtension = value && value.match(/^[a-zA-Z0-9]{1,10}$/) ? value : null;
			} else if (name === 'chatId') {
				chatId = value && value.match(/^[a-f0-9-]{36}$/) ? value : null;
			} else if (name === 'encryptedFileNameSafeBase64') {
				// Goes straight into the filename below, so it has to stay inside the alphabet
				// base64UrlEncode produces - no separators the parsers downstream rely on ('_', '.'),
				// and above all no path separators. Length capped so the whole name fits in 255 bytes.
				encryptedFileNameSafeBase64 = value && /^[A-Za-z0-9~-]{1,170}$/.test(value) ? value : null;
			}
		});

		bb.on('file', async (name: string, file, info) => {
			if (name !== 'encryptedData') {
				file.resume();
				return;
			}

			file.on('error', (err: Error) => {
				if (err.message.includes('aborted') || (err as any).code === 'ECONNRESET') {
					handleAbort();
				} else {
					console.error('File stream error:', err);
					resolve(errorResponse(500, 'Upload stream error'));
				}
			});

			file.on('limit', () => {
				limitExceeded = true;
				file.resume();
				if (uploadPromise && filePath) {
					uploadPromise
						.then(() => {
							if (filePath)
								removeFile(filePath).catch((err) =>
									console.warn('Failed to delete partial file:', err)
								);
						})
						.catch(() => {});
				}
				resolve(errorResponse(413, 'File size limit exceeded'));
			});

			if (
				!type ||
				!encryptedFileNameSafeBase64 ||
				!fileExtension ||
				(!chatId && type === 'chatMedia')
			) {
				file.resume();
				resolve(errorResponse(400, 'Missing required fields'));
				return;
			}

			if (type === 'chatMedia' && chatId) {
				try {
					const chat = await db.chat.findUnique({
						where: { id: chatId },
						select: { participants: { select: { userId: true } } }
					});

					if (!chat || !chat.participants.some((p) => p.userId === locals.user!.id)) {
						file.resume();
						resolve(errorResponse(403, 'Not a participant of this chat'));
						return;
					}
				} catch {
					file.resume();
					resolve(errorResponse(403, 'Invalid chat'));
					return;
				}
			}

			try {
				let relativePath = '';
				if (type === 'chatMedia') {
					relativePath = `/media/${chatId}`;
				} else if (type === 'userSticker') {
					relativePath = `/users/${locals.user!.id}/stickers`;
				} else {
					file.resume();
					resolve(errorResponse(400, 'Invalid upload type'));
					return;
				}

				await ensureUploadDir(UPLOAD_BASE_PATH + relativePath);

				const filename = `${randomUUID()}_${locals.user!.id}_${encryptedFileNameSafeBase64}.${fileExtension}.enc`;
				const candidatePath = path.join(UPLOAD_BASE_PATH + relativePath, filename);

				// Every field above is already validated; this is the backstop that makes it
				// impossible for a future field to widen into a write outside the uploads root.
				const validation = validateUploadPath(candidatePath);
				if (!validation.ok) {
					file.resume();
					resolve(errorResponse(400, 'Invalid upload path'));
					return;
				}
				filePath = candidatePath;

				const writeStream = createWriteStream(filePath);

				writeStream.on('error', (err: Error) => {
					console.error('Write stream error:', err);
					if (!isAborted) {
						resolve(errorResponse(500, 'Failed to write file'));
					}
				});

				// Stream the file directly to disk
				uploadPromise = pipeline(file, writeStream).catch((err: Error) => {
					if (err.message.includes('aborted') || (err as any).code === 'ECONNRESET') {
						handleAbort();
					} else {
						if (limitExceeded) {
							// Ignore pipeline errors caused by limit truncation/destruction
							return;
						}
						throw err;
					}
				});
			} catch (err) {
				file.resume();
				reject(
					error(500, `Failed to setup file upload: ${err instanceof Error ? err.message : err}`)
				);
			}
		});

		bb.on('error', (err: Error) => {
			resolve(errorResponse(400, `Upload parsing error: ${err.message}`));
		});

		bb.on('finish', async () => {
			if (limitExceeded || isAborted) {
				return;
			}

			try {
				if (uploadPromise) {
					await uploadPromise;
				}

				if (!filePath) {
					resolve(errorResponse(400, 'No file was uploaded'));
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
				resolve(
					errorResponse(500, `Failed to save file: ${err instanceof Error ? err.message : err}`)
				);
			}
		});

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

			const nodeStream = new (await import('stream')).Readable({
				read() {}
			});

			nodeStream.on('error', (err: Error) => {
				if (err.message.includes('aborted') || (err as any).code === 'ECONNRESET') {
					handleAbort();
				} else {
					console.error('Node stream error:', err);
					if (!isAborted) {
						resolve(errorResponse(500, 'Stream processing error'));
					}
				}
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
			resolve(errorResponse(400, 'No request body'));
		}
	});
};
