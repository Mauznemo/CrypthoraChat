import { promises as fs } from 'node:fs';
import path from 'node:path';

export function getUploadDir(): string {
	return process.env.NODE_ENV === 'development' ? './uploads' : '/uploads';
}

export async function ensureUploadDir(path: string) {
	try {
		await fs.access(path);
	} catch {
		await fs.mkdir(path, { recursive: true });
	}
}

export async function fileExists(filePath: string) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

export async function removeDir(dirPath: string) {
	const absPath = path.resolve(dirPath);
	try {
		await fs.access(absPath);
		await fs.rm(absPath, { recursive: true, force: true });
	} catch {}
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
