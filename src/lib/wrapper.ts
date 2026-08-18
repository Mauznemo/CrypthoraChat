import { browser } from '$app/environment';
import { getOtherDmUser } from '$lib/chat/chats';
import { chatStore } from '$lib/stores/chat.svelte';

/**
 * Calls into the Flutter wrapper app.
 *
 * Everything here is a no-op in a browser or PWA, so callers never have to guard.
 */

/** Android drops everything past its own (device specific) cap, this is just an upper bound. */
const MAX_SHORTCUTS = 10;
const SYNC_DEBOUNCE_MS = 2000;

let syncTimeout: ReturnType<typeof setTimeout> | null = null;

function bridge(): { callHandler: (name: string, ...args: unknown[]) => Promise<unknown> } | null {
	if (!browser || !window.isFlutterWebView) return null;
	return window.flutter_inappwebview ?? null;
}

/**
 * Hands the wrapper the current chat list so it can publish Android conversation shortcuts.
 *
 * Those shortcuts are what back launcher search, the share sheet and the profile pictures in
 * notifications. Debounced because the chat list is refreshed far more often than it changes.
 */
export function syncShortcuts(): void {
	if (!bridge()) return;
	if (syncTimeout) clearTimeout(syncTimeout);
	syncTimeout = setTimeout(() => void pushShortcuts(), SYNC_DEBOUNCE_MS);
}

async function pushShortcuts(): Promise<void> {
	const api = bridge();
	if (!api) return;

	const shortcuts = chatStore.chats
		.slice(0, MAX_SHORTCUTS)
		.map((chat) => {
			const other = getOtherDmUser(chat, chatStore.user?.id);
			const imagePath = chat.type === 'group' ? chat.imagePath : other?.profilePicPath;
			return {
				id: chat.id,
				label:
					chat.type === 'group' ? (chat.name ?? '') : (other?.displayName ?? other?.username ?? ''),
				// The endpoint is unauthenticated, so the wrapper can fetch this from its push
				// isolate without any session plumbing.
				imageUrl: imagePath
					? `${location.origin}/api/profile-picture?filePath=${encodeURIComponent(imagePath)}&size=256`
					: null
			};
		})
		.filter((shortcut) => shortcut.label !== '');

	try {
		await api.callHandler('syncShortcuts', shortcuts);
	} catch (error) {
		console.error('Failed to sync shortcuts:', error);
	}
}

/**
 * Tells the wrapper a chat is on screen, which clears that chat's unread count and dismisses its
 * notification. Only that chat, so unread counts for the others survive.
 */
export function notifyChatOpened(chatId: string): void {
	void bridge()?.callHandler('chatOpened', chatId);
}

/**
 * A chat the wrapper wants opened, from a notification, a person shortcut or a share.
 *
 * The wrapper sets these globals as well as calling `goToChat`/`shareToChat` directly, because the
 * page may still be mounting when the launch is delivered. Consumed exactly once.
 */
export function takePendingLaunch(): { chatId: string | null; sharedText: string | null } {
	if (!browser) return { chatId: null, sharedText: null };
	const chatId = window.__pendingChatId ?? null;
	const sharedText = window.__pendingSharedText ?? null;
	window.__pendingChatId = null;
	window.__pendingSharedText = null;
	return { chatId, sharedText };
}

/**
 * Hands a link to the wrapper so it opens in the system browser instead of navigating the WebView.
 *
 * Returns false in a browser or PWA, where the caller should let the anchor behave normally.
 */
export function openExternalUrl(url: string): boolean {
	const api = bridge();
	if (!api) return false;

	void Promise.resolve(api.callHandler('openUrl', url)).catch((error) => {
		console.error('Flutter handler error:', error);
	});
	return true;
}
