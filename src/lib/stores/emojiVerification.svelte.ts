class EmojiVerificationStore {
	isOpen = $state(false);
	title = $state('');
	base64: string = $state('');
	onMatch?: () => void;
	onFail?: () => void;

	openDisplay(title: string, base64: string, onMatch: () => void, onFail: () => void) {
		this.isOpen = true;
		this.title = title;
		this.base64 = base64;
		this.onMatch = onMatch;
		this.onFail = onFail;
	}

	close() {
		this.isOpen = false;
	}
}

export const emojiVerificationStore = new EmojiVerificationStore();
