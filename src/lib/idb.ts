// db.ts
import { browser } from '$app/environment';
import { openDB } from 'idb';
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
}

// Open and export a ready-to-use db instance
export const idb: IDBPDatabase<CrypthoraChatDB> | null = browser
	? await openDB<CrypthoraChatDB>('CrypthoraChatApp', 1, {
			upgrade(database) {
				if (!database.objectStoreNames.contains('master')) {
					database.createObjectStore('master');
				}
				if (!database.objectStoreNames.contains('verifiedUsers')) {
					database.createObjectStore('verifiedUsers');
				}
			}
		})
	: null;
