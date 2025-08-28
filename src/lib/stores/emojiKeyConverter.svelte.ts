class EmojiKeyConverterStore {
	isOpen = $state(false);
	title = $state('');
	key?: CryptoKey | string = $state('');
	useDateSalt? = $state(false);
	onDone?: (key: CryptoKey) => void;

	openInput(title: string, onDone: (key: CryptoKey) => void) {
		this.isOpen = true;
		this.title = title;
		this.onDone = onDone;
	}

	openDisplay(title: string, useDateSalt: boolean, key: CryptoKey | string) {
		this.isOpen = true;
		this.title = title;
		this.key = key;
		this.useDateSalt = useDateSalt;
	}

	close() {
		this.isOpen = false;
	}
}

export const emojiKeyConverterStore = new EmojiKeyConverterStore();
