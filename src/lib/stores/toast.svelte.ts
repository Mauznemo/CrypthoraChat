type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
	id: string;
	message: string;
	title?: string;
	type: ToastType;
	duration: number;
}

class Toast {
	toasts = $state<ToastItem[]>([]);

	private show(message: string, type: ToastType, title?: string, duration = 3000) {
		const id = Math.random().toString(36).substring(2, 9);

		const toast: ToastItem = {
			id,
			message,
			title,
			type,
			duration
		};

		this.toasts = [...this.toasts, toast];

		if (duration > 0) {
			setTimeout(() => {
				this.dismiss(id);
			}, duration);
		}
	}

	success(message: string, title?: string, duration?: number) {
		this.show(message, 'success', title, duration);
	}

	error(message: string, title?: string, duration?: number) {
		this.show(message, 'error', title, duration);
	}

	warning(message: string, title?: string, duration?: number) {
		this.show(message, 'warning', title, duration);
	}

	info(message: string, title?: string, duration?: number) {
		this.show(message, 'info', title, duration);
	}

	dismiss(id: string) {
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}

	clear() {
		this.toasts = [];
	}
}

export const toastStore = new Toast();
