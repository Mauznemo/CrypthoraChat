import { openDB, type IDBPDatabase } from 'idb';

/**
 * Per-chat notification bookkeeping, mirroring what the wrapper app does natively.
 *
 * Lives in its own IndexedDB database (not the app one from `$lib/idb`) because the service
 * worker needs to read and write it from the push event, where none of the app's
 * `$app/environment` guarded modules are usable.
 */

export interface ChatNotification {
	chatId: string;
	/** Messages that arrived for this chat since it was last opened. */
	count: number;
	/** Metadata of the *latest* message, overwritten on every push. */
	username: string;
	chatName?: string;
	groupType: 'dm' | 'group';
	imageUrl?: string;
	timestamp: number;
}

const DB_NAME = 'CrypthoraChatNotifications';
const STORE_NAME = 'chats';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
	if (!dbPromise) {
		dbPromise = openDB(DB_NAME, 1, {
			upgrade(database) {
				if (!database.objectStoreNames.contains(STORE_NAME)) {
					database.createObjectStore(STORE_NAME);
				}
			}
		});
	}
	return dbPromise;
}

/**
 * Bumps this chat's unread count and replaces its stored latest-message data.
 *
 * Returns the merged entry so the caller can build the notification from it. Storage failures
 * are not fatal: the notification still gets shown, just without a running count.
 */
export async function recordChatNotification(
	entry: Omit<ChatNotification, 'count'>
): Promise<ChatNotification> {
	try {
		const database = await db();
		const previous = (await database.get(STORE_NAME, entry.chatId)) as ChatNotification | undefined;
		const merged: ChatNotification = { ...entry, count: (previous?.count ?? 0) + 1 };
		await database.put(STORE_NAME, merged, entry.chatId);
		return merged;
	} catch (error) {
		console.error('Failed to record chat notification:', error);
		return { ...entry, count: 1 };
	}
}

/** Drops one chat's count and latest-message data. Every other chat is left alone. */
export async function clearChatNotificationState(chatId: string): Promise<void> {
	try {
		const database = await db();
		await database.delete(STORE_NAME, chatId);
	} catch (error) {
		console.error('Failed to clear chat notification state:', error);
	}
}

/**
 * Drops stored counts for chats the server considers fully read, and for chats that are gone.
 *
 * These counters are a second unread system next to the server's `readBy` rows, and they only
 * ever shrink when the web layer explicitly clears a chat. A single missed clear - a chat read
 * on another device, a notification tap that never reached the page - therefore leaves a count
 * that every later push keeps incrementing. Reconciling on each chat list load makes the badge
 * self-healing.
 *
 * Only ever deletes: the server's unread count is capped and not a trustworthy replacement
 * value, but a zero is trustworthy, because an unread message always has an empty `readBy`.
 *
 * Returns whether anything was removed, so the caller can skip a needless badge write.
 */
export async function reconcileNotificationState(
	readChatIds: string[],
	knownChatIds: string[]
): Promise<boolean> {
	try {
		const database = await db();
		const keys = (await database.getAllKeys(STORE_NAME)) as string[];

		const read = new Set(readChatIds);
		const known = new Set(knownChatIds);
		const stale = keys.filter((key) => read.has(key) || !known.has(key));

		for (const key of stale) await database.delete(STORE_NAME, key);

		return stale.length > 0;
	} catch (error) {
		console.error('Failed to reconcile notification state:', error);
		return false;
	}
}

/** Total unread messages across all chats, for the app badge. */
export async function totalNotificationCount(): Promise<number> {
	try {
		const database = await db();
		const entries = (await database.getAll(STORE_NAME)) as ChatNotification[];
		return entries.reduce((total, entry) => total + entry.count, 0);
	} catch (error) {
		console.error('Failed to read notification counts:', error);
		return 0;
	}
}
