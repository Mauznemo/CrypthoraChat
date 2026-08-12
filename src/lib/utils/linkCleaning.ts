export const linkCleaning = {
	isEnabled(): boolean {
		if (typeof localStorage === 'undefined') return true;
		return localStorage.getItem('cleanPastedLinks') !== 'false';
	},
	setEnabled(enabled: boolean): void {
		localStorage.setItem('cleanPastedLinks', enabled ? 'true' : 'false');
	}
};
