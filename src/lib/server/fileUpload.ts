import { promises as fs } from 'node:fs';
import path from 'node:path';

export function getUploadDir(): string {
	return process.env.NODE_ENV === 'development' ? './uploads' : '/uploads';
}

export type PathValidation = { ok: true; absolute: string } | { ok: false; error: string };

/**
 * The single containment check for every path that reaches the filesystem.
 *
 * Uses path.relative rather than a string prefix test, so a sibling directory whose name merely
 * starts with the uploads root (/uploads-backup) cannot pass.
 */
export function validateUploadPath(filePath: string): PathValidation {
	const uploadDir = getUploadDir();
	const absUploadDir = path.resolve(uploadDir);
	const absFilePath = path.resolve(filePath);
	const relative = path.relative(absUploadDir, absFilePath);

	if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
		return { ok: false, error: 'Path traversal detected' };
	}

	return { ok: true, absolute: absFilePath };
}

/** Metadata the client prepends to an attachment path, ahead of the real path. */
const ATTACHMENT_PREFIXES = [/^sticker:/, /^dimensions\(\d{1,6}x\d{1,6}\):/];

/**
 * Strips the metadata prefixes an attachment path carries, then validates what is left.
 *
 * Only these exact prefixes are removed. The previous rule - drop everything up to the first
 * colon - let a caller park arbitrary text in front of the path, which is the kind of silent
 * input rewriting that makes the containment check below hard to reason about.
 */
export function validateAttachmentPath(filePath: string): PathValidation {
	let stripped = filePath;
	let changed = true;
	while (changed) {
		changed = false;
		for (const prefix of ATTACHMENT_PREFIXES) {
			const next = stripped.replace(prefix, '');
			if (next !== stripped) {
				stripped = next;
				changed = true;
			}
		}
	}

	return validateUploadPath(stripped);
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
	const validation = validateUploadPath(dirPath);
	if (!validation.ok) return;
	const absPath = validation.absolute;
	try {
		await fs.access(absPath);
		await fs.rm(absPath, { recursive: true, force: true });
	} catch {}
}

export async function removeFile(filePath: string) {
	// Attachment-aware: callers pass stored attachment paths, which still carry their prefixes.
	const validation = validateAttachmentPath(filePath);
	if (!validation.ok) return;
	const absPath = validation.absolute;
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

/**
 * Asserts a path a client hands back is one that user just uploaded, and returns it.
 *
 * The upload endpoints answer with the path they wrote, and the client replays it into
 * `saveUserSticker` / `updateProfilePicture` / `updateGroupImage`. Without this the stored path is
 * whatever the client says, which turns the next replace-and-delete into an unlink of any file
 * under /uploads - another user's avatar, for instance.
 */
export function assertOwnedUpload(
	filePath: string,
	userId: string,
	kind: 'sticker' | 'picture'
): string {
	const validation = validateUploadPath(filePath);
	if (!validation.ok) return '';

	const absolute = validation.absolute;

	if (kind === 'sticker') {
		// Stickers live in a per-user directory, so containment alone settles ownership.
		const dir = path.resolve(getUploadDir(), 'users', userId, 'stickers') + path.sep;
		return absolute.startsWith(dir) ? absolute : '';
	}

	// Avatars and group images share one directory, so ownership rides in the filename:
	// <uuid>_<uploaderId>.<ext>.enc
	const dir = path.resolve(getUploadDir(), 'profiles') + path.sep;
	if (!absolute.startsWith(dir)) return '';

	const owner = path.basename(absolute).split('.')[0].split('_')[1];
	return owner === userId ? absolute : '';
}
