import { deleteFilesNotContaining } from '$lib/idb';
import { chatStore } from '$lib/stores/chat.svelte';
import type { ClientChat } from '$lib/types';
import { getUserChats } from './chat.remote';

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

		if (options?.pruneFiles) await deleteFilesNotContaining(chats.map((chat) => chat.id));
	},

	addChat(newChat: ClientChat): void {
		if (chatStore.chats.find((chat) => chat.id === newChat.id)) return;
		chatStore.chats = [...chatStore.chats, newChat].sort(
			(a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
		);
	},

	removeChat(chatId: string): void {
		chatStore.chats = chatStore.chats
			.filter((chat) => chat.id !== chatId)
			.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
		if (localStorage.getItem('lastChatId') === chatId) localStorage.removeItem('lastChatId');
	},

	updateChat(updatedChat: ClientChat): void {
		chatStore.chats = chatStore.chats
			.map((chat) => (chat.id === updatedChat.id ? updatedChat : chat))
			.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
	}
};
