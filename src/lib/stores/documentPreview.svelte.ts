class DocumentPreviewStore {
	isOpen = $state(false);
	src = $state('');
	type: 'pdf' | 'html' = $state('pdf');
	name = $state('');

	openDisplay(src: string, type: 'pdf' | 'html', name: string) {
		this.src = src;
		this.type = type;
		this.name = name;
		this.isOpen = true;
	}

	close() {
		this.isOpen = false;
	}
}

export const documentPreviewStore = new DocumentPreviewStore();
