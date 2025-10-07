class Onboarding {
	showBackupMasterKeyNotice = $state(false);

	init() {
		this.showBackupMasterKeyNotice = !(localStorage.getItem('showBackupMasterKey') === 'false');
	}

	disableBackupMasterKeyNotice() {
		this.showBackupMasterKeyNotice = false;
		localStorage.setItem('showBackupMasterKey', 'false');
	}
}

export const onboardingStore = new Onboarding();
