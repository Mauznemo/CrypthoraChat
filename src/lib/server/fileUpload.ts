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
