interface ModalButton {
	text: string;
	variant?: 'primary' | 'secondary' | 'danger';
	onClick?: () => void;
}

interface ModalConfig {
	title: string;
	content: string;
	buttons?: ModalButton[];
	showCloseButton?: boolean;
}

class ModalStore {
	isOpen = $state(false);
	config = $state<ModalConfig>({
		title: '',
		content: '',
		buttons: [],
		showCloseButton: true
	});

	open(config: ModalConfig) {
		this.config = {
			showCloseButton: true,
			...config
		};
		this.isOpen = true;
	}

	close() {
		this.isOpen = false;
	}

	// Convenience methods for common modal types
	confirm(title: string, content: string, onConfirm?: () => void, onCancel?: () => void) {
		this.open({
			title,
			content,
			buttons: [
				{
					text: 'Cancel',
					variant: 'secondary',
					onClick: () => {
						onCancel?.();
						this.close();
					}
				},
				{
					text: 'Confirm',
					variant: 'primary',
					onClick: () => {
						onConfirm?.();
						this.close();
					}
				}
			]
		});
	}

	alert(title: string, content: string, onOk?: () => void) {
		this.open({
			title,
			content,
			buttons: [
				{
					text: 'OK',
					variant: 'primary',
					onClick: () => {
						onOk?.();
						this.close();
					}
				}
			]
		});
	}
}

export const modalStore = new ModalStore();
