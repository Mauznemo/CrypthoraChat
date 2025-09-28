import { chatStore } from '$lib/stores/chat.svelte';
import type { ClientChat } from '$lib/types';

export const chatList = {
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
