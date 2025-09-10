import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function ensureUploadDir(path: string) {
	try {
		await fs.access(path);
	} catch {
		await fs.mkdir(path, { recursive: true });
	}
}

export async function removeFile(filePath: string) {
	const absPath = path.resolve(filePath);
	try {
		await fs.access(absPath);
		await fs.unlink(absPath);
	} catch {}
}

export function errorResponse(status: number, message: string): Response {
	return new Response(JSON.stringify({ error: message, message }), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}
