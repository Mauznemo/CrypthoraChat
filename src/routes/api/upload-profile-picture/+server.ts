import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import busboy from 'busboy';
import { base64ToArrayBuffer } from '$lib/crypto/utils';
import { ensureUploadDir } from '$lib/server/fileUpload';

const UPLOAD_PATH = (process.env.UPLOAD_PATH || './uploads') + '/profiles';
const TEMP_PATH = (process.env.UPLOAD_PATH || './uploads') + '/temp';

let serverKeyPromise: Promise<CryptoKey> | null = null;
async function getServerKey(): Promise<CryptoKey> {
	if (!serverKeyPromise) {
		const rawKey = base64ToArrayBuffer(process.env.PROFILE_PIC_KEY!);
		serverKeyPromise = crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, [
			'encrypt',
			'decrypt'
		]);
	}
	return serverKeyPromise;
}

async function encryptFileStream(inputPath: string, outputPath: string): Promise<void> {
	const serverKey = await getServerKey();
	const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

	const fileData = await fs.readFile(inputPath);
	const bytes = new Uint8Array(fileData);

	const encrypted = await globalThis.crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		serverKey,
		bytes
	);

	const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(encrypted), iv.byteLength);

	await fs.writeFile(outputPath, combined);
}

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
		try {
			await ensureUploadDir(UPLOAD_PATH);
			await ensureUploadDir(TEMP_PATH);
		} catch (err) {
			reject(
				error(
					500,
					`Failed to create upload directories: ${err instanceof Error ? err.message : err}`
				)
			);
			return;
		}

		const bb = busboy({
			headers: { 'content-type': contentType },
			limits: {
				fileSize: 20 * 1024 * 1024, // 20MB limit for profile pictures
				files: 1
			}
		});

		let fileExtension = 'png';
		let tempFilePath: string | null = null;
		let finalFilePath: string | null = null;
		let uploadPromise: Promise<void> | null = null;

		// Handle form fields
		bb.on('field', (name: string, value: string) => {
			if (name === 'fileExtension') {
				fileExtension = value || 'png';
			}
		});

		bb.on('file', async (name: string, file, info) => {
			if (name !== 'file') {
				file.resume();
				return;
			}

			try {
				// Create temporary file path
				const tempFilename = `temp_${randomUUID()}`;
				tempFilePath = path.join(TEMP_PATH, tempFilename);

				// Create final encrypted file path
				const finalFilename = `${randomUUID()}.${fileExtension}.enc`;
				finalFilePath = path.join(UPLOAD_PATH, finalFilename);

				// Stream file to temporary location first
				const writeStream = createWriteStream(tempFilePath);
				uploadPromise = pipeline(file, writeStream);
			} catch (err) {
				file.resume();
				reject(
					error(500, `Failed to setup file upload: ${err instanceof Error ? err.message : err}`)
				);
			}
		});

		bb.on('error', (err: Error) => {
			reject(error(400, `Upload parsing error: ${err.message}`));
		});

		bb.on('finish', async () => {
			try {
				if (uploadPromise) {
					await uploadPromise;
				}

				if (!tempFilePath || !finalFilePath) {
					reject(error(400, 'No file was uploaded'));
					return;
				}

				await encryptFileStream(tempFilePath, finalFilePath);

				try {
					await fs.unlink(tempFilePath);
				} catch (err) {
					console.warn('Failed to clean up temporary file:', err);
				}

				resolve(
					new Response(JSON.stringify({ success: true, filePath: finalFilePath }), {
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					})
				);
			} catch (err) {
				console.error('Profile upload error:', err);

				// Clean up temporary file on error
				if (tempFilePath) {
					try {
						await fs.unlink(tempFilePath);
					} catch (cleanupErr) {
						console.warn('Failed to clean up temporary file on error:', cleanupErr);
					}
				}

				reject(error(500, `Failed to process file: ${err instanceof Error ? err.message : err}`));
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
