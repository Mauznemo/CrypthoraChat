import type { ChatWithoutMessages, ClientMessage } from '$lib/types';
import type { SystemMessage, User } from '$prisma';

class Chat {
	user: User | null = $state(null);
	activeChat: ChatWithoutMessages | null = $state(null);
	versionedChatKey: Record<number, CryptoKey> = $state({});
	// newestChatKey: CryptoKey | null = $derived.by(() => {

	// 	// const keys = Object.keys(this.versionedChatKey);
	// 	// if (keys.length === 0) return null;

	// 	// // Convert string keys to numbers and find the highest version
	// 	// const highestVersion = Math.max(...keys.map(Number));
	// 	// return this.versionedChatKey[highestVersion];
	// });
	//chatKey: CryptoKey | null = $state(null);
	combinedMessages = $derived.by(() => {
		return [...this.messages, ...this.systemMessages].sort(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);
	});
	messages: ClientMessage[] = $state([]);
	systemMessages: SystemMessage[] = $state([]);
	loadingChat = $state(true);
	shouldAutoScroll = $state(true);

	getNewestChatKey(): CryptoKey | null {
		if (this.activeChat === null) return null;

		const key = this.versionedChatKey[this.activeChat.currentKeyVersion];
		if (!key) return null;

		return key;
	}

	resetChatKey(): void {
		this.versionedChatKey = {};
	}

	resetMessages(): void {
		this.messages = [];
		this.systemMessages = [];
	}

	chats: ChatWithoutMessages[] = $state([]);
}

export const chatStore = new Chat();
