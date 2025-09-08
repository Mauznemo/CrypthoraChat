import { browser } from '$app/environment';
import type { SafeUser } from '$lib/types';

class InfoBar {
	isOpen = $state(browser ? localStorage.getItem('infoOpen') === 'true' : false);
	userToShow: SafeUser | null = $state(null);

	openUserInfo(user: SafeUser) {
		this.userToShow = user;
		this.isOpen = true;
		localStorage.setItem('infoOpen', 'true');
	}

	openChatInfo() {
		this.userToShow = null;
		this.isOpen = true;
		localStorage.setItem('infoOpen', 'true');
	}

	close() {
		this.userToShow = null;
		this.isOpen = false;
		localStorage.removeItem('infoOpen');
	}
}

export const infoBarStore = new InfoBar();
