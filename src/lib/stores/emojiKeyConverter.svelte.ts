class EmojiKeyConverterStore {
	isOpen = $state(false);
	title = $state('');
	base64Seed?: string = $state('');
	useDateSalt? = $state(false);
	onDone?: (base64Seed: string) => void;

	private clearEmojiInput?: () => void;

	openInput(title: string, useDateSalt: boolean, onDone: (base64Seed: string) => void) {
		this.isOpen = true;
		this.title = title;
		this.useDateSalt = useDateSalt;
		this.base64Seed = undefined;
		this.onDone = onDone;
	}

	openDisplay(title: string, useDateSalt: boolean, base64Seed: string) {
		this.isOpen = true;
		this.title = title;
		this.base64Seed = base64Seed;
		this.useDateSalt = useDateSalt;
	}

	clearInput() {
		if (this.clearEmojiInput) {
			this.clearEmojiInput();
		}
	}

	close() {
		this.isOpen = false;
	}
}

export const emojiKeyConverterStore = new EmojiKeyConverterStore();
