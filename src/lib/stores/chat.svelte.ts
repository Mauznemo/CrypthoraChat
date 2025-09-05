import type { ChatWithoutMessages, ClientMessage } from '$lib/types';
import type { User } from '$prisma';

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
	messages: ClientMessage[] = $state([]);
	loadingChat = $state(true);
	shouldAutoScroll = $state(true);

	getNewestChatKey(): CryptoKey | null {
		console.log('newestChatKey:', this.versionedChatKey);
		if (this.activeChat === null) return null;

		const key = this.versionedChatKey[this.activeChat.currentKeyVersion];
		if (!key) return null;

		return key;
	}

	resetChatKey(): void {
		this.versionedChatKey = {};
	}
}

export const chatStore = new Chat();
