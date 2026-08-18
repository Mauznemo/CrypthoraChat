interface PasswordConfirmConfig {
	title: string;
	content: string;
	/** Runs only after the password was verified by the server. */
	onConfirm: () => void;
	onCancel?: () => void;
}

/**
 * Asks the user for their account password before an action that cannot be undone, like generating
 * a new master key. The password is only ever checked on the server, see `confirmPassword`.
 */
class PasswordConfirmStore {
	isOpen = $state(false);
	config = $state<PasswordConfirmConfig>({
		title: '',
		content: '',
		onConfirm: () => {}
	});

	open(config: PasswordConfirmConfig) {
		this.config = config;
		this.isOpen = true;
	}

	/** Dismisses without running the action. */
	close() {
		if (!this.isOpen) return;
		this.isOpen = false;
		this.config.onCancel?.();
	}

	/** Called by the prompt once the server accepted the password. */
	confirm() {
		if (!this.isOpen) return;
		this.isOpen = false;
		this.config.onConfirm();
	}
}

export const passwordConfirmStore = new PasswordConfirmStore();
