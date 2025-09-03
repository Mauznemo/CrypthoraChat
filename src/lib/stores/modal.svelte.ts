interface ModalButton {
	text: string;
	variant?: 'primary' | 'secondary' | 'danger';
	onClick?: () => void;
}

interface ModalConfig {
	title: string;
	id?: string;
	content: string;
	buttons?: ModalButton[];
	showCloseButton?: boolean;
	onClose?: () => void;
}

class ModalStore {
	private modalQueue: ModalConfig[] = [];
	isOpen = $state(false);
	config = $state<ModalConfig>({
		title: '',
		content: '',
		buttons: [],
		showCloseButton: true
	});

	removeFromQueue(id: string) {
		this.modalQueue = this.modalQueue.filter((modal) => modal.id !== id);
	}

	open(config: ModalConfig) {
		if (this.isOpen) {
			this.modalQueue.push(config);
			return;
		}
		this.config = {
			showCloseButton: true,
			...config
		};
		this.isOpen = true;
	}

	close() {
		this.isOpen = false;

		this.config.onClose?.();

		// Show next modal in queue if exists
		if (this.modalQueue.length > 0) {
			const nextModal = this.modalQueue.shift();
			// Small delay to ensure smooth transition
			setTimeout(() => {
				if (nextModal) this.open(nextModal);
			}, 100);
		}
	}

	// Convenience methods for common modal types
	confirm(
		title: string,
		content: string,
		onConfirm?: () => void,
		onCancel?: () => void,
		onClose?: () => void
	) {
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
			],
			onClose: () => {
				onClose?.();
			}
		});
	}

	alert(
		title: string,
		content: string,
		options?: { onOk?: () => void; onClose?: () => void; id?: string }
	) {
		this.open({
			title,
			content,
			id: options?.id,
			buttons: [
				{
					text: 'OK',
					variant: 'primary',
					onClick: () => {
						options?.onOk?.();
						this.close();
					}
				}
			],
			onClose: () => options?.onClose?.()
		});
	}
}

export const modalStore = new ModalStore();
