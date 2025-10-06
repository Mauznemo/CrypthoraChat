class ImagePreviewStore {
	isOpen = $state(false);
	src = $state('');

	openDisplay(src: string) {
		this.src = src;
		this.isOpen = true;
	}

	close() {
		this.isOpen = false;
	}
}

export const imagePreviewStore = new ImagePreviewStore();
