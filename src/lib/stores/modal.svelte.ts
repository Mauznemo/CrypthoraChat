import type { Snippet } from 'svelte';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';

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
	dismissible?: boolean;
	onClose?: () => void;
	customContent?: Snippet;
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

	open(config: ModalConfig, highPriority = false) {
		if (this.isOpen) {
			if (highPriority) this.modalQueue.unshift(config);
			else this.modalQueue.push(config);
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

	updateContent(id: string, content: string) {
		if (this.config.id === id) this.config.content = content;
	}

	isModalOpen(id: string) {
		return this.config.id === id;
	}

	confirm(
		title: string,
		content: string,
		options?: {
			onConfirm?: () => void;
			onCancel?: () => void;
			onClose?: () => void;
			dismissible?: boolean;
		}
	) {
		this.open(
			{
				title,
				content,
				dismissible: options?.dismissible ?? false,
				buttons: [
					{
						text: get(t)('common.cancel'),
						variant: 'secondary',
						onClick: () => {
							options?.onCancel?.();
							this.close();
						}
					},
					{
						text: get(t)('common.confirm'),
						variant: 'primary',
						onClick: () => {
							options?.onConfirm?.();
							this.close();
						}
					}
				],
				onClose: () => {
					options?.onClose?.();
				}
			},
			true
		);
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
					text: get(t)('common.ok'),
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

	error(error: any, message?: string, unknownMessage?: string): void;
	error(message: string): void;

	error(
		errorOrMessage: any,
		message: string = 'An error occurred:',
		unknownMessage: string = 'Something went wrong'
	) {
		if (typeof errorOrMessage === 'string' && message === 'An error occurred:') {
			this.alert(get(t)('common.error'), errorOrMessage);
		} else {
			this.alert(
				get(t)('common.error'),
				message +
					' ' +
					(errorOrMessage?.body?.message ||
						errorOrMessage?.message ||
						String(errorOrMessage) ||
						unknownMessage)
			);
		}
	}
}

export const modalStore = new ModalStore();
