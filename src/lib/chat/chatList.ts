import { deleteFilesNotContaining } from '$lib/idb';
import { reconcileNotificationState } from '$lib/notificationState';
import { chatStore } from '$lib/stores/chat.svelte';
import { updateAppBadge } from '$lib/stores/notifications.svelte';
import type { ClientChat } from '$lib/types';
import { syncShortcuts } from '$lib/wrapper';
import { getUserChats } from './chat.remote';

/**
 * Prunes notification counts the server's read state says are stale, so the app icon badge
 * cannot keep a number for a chat that has already been read. The wrapper app owns its own
 * badge, same as everywhere else the web layer touches notifications.
 */
async function reconcileBadge(chats: ClientChat[]): Promise<void> {
	if (window.isFlutterWebView) return;

	const readChatIds = chats.filter((chat) => !chat.unreadMessages).map((chat) => chat.id);
	if (chatStore.activeChat) readChatIds.push(chatStore.activeChat.id);

	const changed = await reconcileNotificationState(
		readChatIds,
		chats.map((chat) => chat.id)
	);
	if (changed) await updateAppBadge();
}

export const chatList = {
	/**
	 * Re-reads the chat list from the server. Shared by the initial load and by reconnects:
	 * nothing is queued server side, so a new-chat-created that arrived while the socket was
	 * down is only recoverable this way.
	 */
	async refresh(options?: { force?: boolean; pruneFiles?: boolean }): Promise<void> {
		const query = getUserChats();
		// Only a resolved, tracked query needs an explicit refresh; forcing one on the first
		// load would just cost a second round-trip.
		if (options?.force && query.ready) await query.refresh();

		const chats = await query;
		chatStore.chats = chats;

		await reconcileBadge(chats);

		if (options?.pruneFiles) await deleteFilesNotContaining(chats.map((chat) => chat.id));

		// Every mutation below does this too, so the wrapper's Android shortcuts follow the list
		// without any caller having to remember.
		syncShortcuts();
	},

	addChat(newChat: ClientChat): void {
		if (chatStore.chats.find((chat) => chat.id === newChat.id)) return;
		chatStore.chats = [...chatStore.chats, newChat].sort(
			(a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
		);
		syncShortcuts();
	},

	removeChat(chatId: string): void {
		chatStore.chats = chatStore.chats
			.filter((chat) => chat.id !== chatId)
			.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
		if (localStorage.getItem('lastChatId') === chatId) localStorage.removeItem('lastChatId');
		syncShortcuts();
	},

	updateChat(updatedChat: ClientChat): void {
		chatStore.chats = chatStore.chats
			.map((chat) => (chat.id === updatedChat.id ? updatedChat : chat))
			.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
		syncShortcuts();
	}
};
