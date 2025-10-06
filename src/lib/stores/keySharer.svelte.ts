class KeySharerStore {
	isOpen = $state(false);
	title = $state('');
	base64Seed?: string = $state('');
	useDateSalt? = $state(false);
	onDone?: (base64Seed: string) => void;

	private clearEmojiInput?: () => void;

	openInput(title: string, useDateSalt: boolean, onDone: (base64Seed: string) => void) {
		this.title = title;
		this.useDateSalt = useDateSalt;
		this.base64Seed = undefined;
		this.onDone = onDone;
		this.isOpen = true;
	}

	openDisplay(title: string, useDateSalt: boolean, base64Seed: string) {
		this.title = title;
		this.base64Seed = base64Seed;
		this.useDateSalt = useDateSalt;
		this.isOpen = true;
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

export const keySharerStore = new KeySharerStore();
