class EmojiPickerStore {
	isOpen = $state(false);
	position = $state({ x: 0, y: 0 });
	onSelected?: (emoji: string) => void;
	closeOnPick: boolean = true;

	open(element: HTMLElement, onSelected?: (emoji: string) => void, closeOnPick: boolean = true) {
		this.isOpen = true;

		this.onSelected = onSelected;
		this.closeOnPick = closeOnPick;

		const rect = element.getBoundingClientRect();
		this.position = {
			x: rect.left,
			y: rect.bottom + 8
		};
	}

	close() {
		this.isOpen = false;
	}
}

export const emojiPickerStore = new EmojiPickerStore();
