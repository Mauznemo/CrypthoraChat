export const linkConfirmation = {
	isEnabled(): boolean {
		return localStorage.getItem('confirmLinksInPwa') !== 'false';
	},
	setEnabled(enabled: boolean): void {
		localStorage.setItem('confirmLinksInPwa', enabled ? 'true' : 'false');
	}
};
