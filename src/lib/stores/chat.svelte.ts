import type { ChatWithoutMessages, ClientMessage } from '$lib/types';
import type { User } from '$prisma';

class Chat {
	user: User | null = $state(null);
	activeChat: ChatWithoutMessages | null = $state(null);
	chatKey: CryptoKey | null = $state(null);
	messages: ClientMessage[] = $state([]);
}

export const chatStore = new Chat();
