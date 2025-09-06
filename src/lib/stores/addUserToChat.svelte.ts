import type { ChatWithoutMessages } from '$lib/types';

class AddUserToChat {
	isOpen = $state(false);
	chat: ChatWithoutMessages | null = $state(null);
	open(chat: ChatWithoutMessages) {
		this.chat = chat;
		this.isOpen = true;
	}

	close() {
		this.chat = null;
		this.isOpen = false;
	}
}

export const addUserToChatStore = new AddUserToChat();
