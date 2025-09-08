import type { ChatWithoutMessages, ClientMessage, SafeUser } from '$lib/types';
import type { SystemMessage, User } from '$prisma';

class InfoBar {
	isOpen = $state(true);
	userToShow: SafeUser | null = $state(null);

	openUserInfo(user: SafeUser) {
		this.userToShow = user;
		this.isOpen = true;
	}

	openChatInfo() {
		this.userToShow = null;
		this.isOpen = true;
	}

	close() {
		this.userToShow = null;
		this.isOpen = false;
	}
}

export const infoBarStore = new InfoBar();
