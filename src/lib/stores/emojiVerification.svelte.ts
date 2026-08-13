class EmojiVerificationStore {
	isOpen = $state(false);
	title = $state('');
	base64: string = $state('');
	private onResult?: (matched: boolean) => void;
	private settled = true;

	openDisplay(title: string, base64: string, onResult: (matched: boolean) => void) {
		this.isOpen = true;
		this.title = title;
		this.base64 = base64;
		this.onResult = onResult;
		this.settled = false;
	}

	/**
	 * Every close path routes through here, so a caller awaiting the result can never hang.
	 * `matched === false` covers both "they don't match" and plain dismissal.
	 */
	close(matched = false) {
		this.isOpen = false;
		if (this.settled) return;
		this.settled = true;
		this.onResult?.(matched);
	}
}

export const emojiVerificationStore = new EmojiVerificationStore();
