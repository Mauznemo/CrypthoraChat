import { browser } from '$app/environment';
import { openDB, deleteDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

interface CrypthoraChatDB extends DBSchema {
	master: {
		key: string; // always "master"
		value: string; // base64 seed
	};
	verifiedUsers: {
		key: string; // userId
		value: {
			userId: string;
			publicKey: string; // base64 public key
		};
	};
	files: {
		key: string;
		value: {
			id: string;
			blob: Blob;
			fileName?: string;
			mimeType?: string;
			uploadedAt: number;
			size: number;
		};
	};
	draftMessages: {
		key: string; // chatId
		value: {
			chatId: string;
			message: string;
		};
	};
}

async function init(): Promise<IDBPDatabase<CrypthoraChatDB>> {
	return await openDB<CrypthoraChatDB>('CrypthoraChatApp', 1, {
		upgrade(database, oldVersion) {
			if (!database.objectStoreNames.contains('master')) {
				database.createObjectStore('master');
			}
			if (!database.objectStoreNames.contains('verifiedUsers')) {
				database.createObjectStore('verifiedUsers');
			}
			if (!database.objectStoreNames.contains('files')) {
				database.createObjectStore('files');
			}
			if (!database.objectStoreNames.contains('draftMessages')) {
				database.createObjectStore('draftMessages');
			}
		}
	});
}

export let idb: IDBPDatabase<CrypthoraChatDB> | null = browser ? await init() : null;

export async function deleteDatabase(): Promise<void> {
	console.log('Deleting DB');
	if (!idb) return;
	idb.close();
	await deleteDB('CrypthoraChatApp', {
		blocked() {
			console.warn('Delete blocked: another connection is open');
		}
	});
	idb = await init();
	console.log('DB deleted');
}

export async function saveFileToIDB(
	fileId: string,
	blob: Blob,
	fileName?: string,
	mimeType?: string
): Promise<void> {
	if (!idb) throw new Error('IndexedDB not available');

	await idb.put(
		'files',
		{
			id: fileId,
			blob,
			fileName,
			mimeType: mimeType || blob.type,
			uploadedAt: Date.now(),
			size: blob.size
		},
		fileId
	);
}

export async function getFileFromIDB(fileId: string): Promise<Blob | null> {
	if (!idb) return null;

	const fileData = await idb.get('files', fileId);
	return fileData?.blob || null;
}

export async function deleteFileFromIDB(fileId: string): Promise<void> {
	if (!idb) throw new Error('IndexedDB not available');

	await idb.delete('files', fileId);
}

export async function fileExistsInIDB(fileId: string): Promise<boolean> {
	if (!idb) return false;

	const key = await idb.getKey('files', fileId);
	return key !== undefined;
}

export async function deleteFilesThatContain(idPart: string): Promise<number> {
	if (!idb) throw new Error('IndexedDB not available');

	const transaction = idb.transaction('files', 'readwrite');
	const store = transaction.objectStore('files');
	let cursor = await store.openCursor();
	let deletedCount = 0;

	while (cursor) {
		if (cursor.key.toString().includes(idPart)) {
			await cursor.delete();
			deletedCount++;
		}
		cursor = await cursor.continue();
	}

	console.log(`Deleted ${deletedCount} files that contained ${idPart}`);
	return deletedCount;
}

export async function deleteFilesNotContaining(
	idParts: string[]
): Promise<{ deletedIds: string[]; count: number }> {
	if (!idb) return { deletedIds: [], count: 0 };

	idParts.push('users'); // always keep user files like stickers

	const transaction = idb.transaction('files', 'readwrite');
	const store = transaction.objectStore('files');
	let cursor = await store.openCursor();
	const deletedIds: string[] = [];

	while (cursor) {
		const fileId = cursor.key.toString();

		const containsAnyIdPart = idParts.some((idPart) => fileId.includes(idPart));

		if (!containsAnyIdPart) {
			deletedIds.push(fileId);
			await cursor.delete();
		}

		cursor = await cursor.continue();
	}

	console.log(`Deleted ${deletedIds.length} files that did not contain any of ${idParts}`);
	return { deletedIds, count: deletedIds.length };
}

export async function getAllFiles(): Promise<
	Array<{ id: string; fileName?: string; size: number; uploadedAt: number }>
> {
	if (!idb) return [];

	const files = await idb.getAll('files');
	return files.map((file) => ({
		id: file.id,
		fileName: file.fileName,
		size: file.size,
		uploadedAt: file.uploadedAt
	}));
}
