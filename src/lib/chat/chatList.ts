import { chatStore } from '$lib/stores/chat.svelte';
import type { ChatWithoutMessages } from '$lib/types';

export const chatList = {
	addChat(newChat: ChatWithoutMessages): void {
		if (chatStore.chats.find((chat) => chat.id === newChat.id)) return;
		chatStore.chats = [...chatStore.chats, newChat];
	},

	removeChat(chatId: string): void {
		chatStore.chats = chatStore.chats.filter((chat) => chat.id !== chatId);
		if (localStorage.getItem('lastChatId') === chatId) localStorage.removeItem('lastChatId');
	},

	updateChat(updatedChat: ChatWithoutMessages): void {
		chatStore.chats = chatStore.chats.map((chat) =>
			chat.id === updatedChat.id ? updatedChat : chat
		);
	}
};
