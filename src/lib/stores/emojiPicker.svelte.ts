class EmojiPickerStore {
	isOpen = $state(false);
	position = $state({ x: 0, y: 0 });
	onSelected?: (emoji: string) => void;
	closeOnPick: boolean = true;
	customEmojiSet?: string[] = [];

	open(
		element: HTMLElement,
		onSelected?: (emoji: string) => void,
		customEmojiSet?: string[],
		closeOnPick: boolean = true
	) {
		this.isOpen = true;

		this.onSelected = onSelected;
		this.closeOnPick = closeOnPick;
		this.customEmojiSet = customEmojiSet;

		const rect = element.getBoundingClientRect();
		this.position = {
			x: rect.left,
			y: rect.bottom + 8
		};
	}

	openAt(
		position: { x: number; y: number },
		onSelected?: (emoji: string) => void,
		customEmojiSet?: string[],
		closeOnPick: boolean = true
	) {
		this.isOpen = true;

		this.onSelected = onSelected;
		this.closeOnPick = closeOnPick;
		this.customEmojiSet = customEmojiSet;

		this.position = position;
	}

	close() {
		this.isOpen = false;
	}
}

export const emojiPickerStore = new EmojiPickerStore();
