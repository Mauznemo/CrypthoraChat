import { modalStore } from '$lib/stores/modal.svelte';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';

export function getDeviceInfo() {
	if (window.isFlutterWebView) {
		return {
			os: 'Mobile',
			browser: 'Wrapper App'
		};
	}

	const ua = navigator.userAgent;
	const userAgentData = (navigator as any).userAgentData;

	let os = 'Unknown OS';
	let browser = 'Unknown Browser';

	if (userAgentData && userAgentData.platform) {
		os = userAgentData.platform;
	} else {
		if (/Windows/i.test(ua)) os = 'Windows';
		else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
		else if (/Mac/i.test(ua)) os = 'macOS';
		else if (/Linux/i.test(ua)) os = 'Linux';
		else if (/Android/i.test(ua)) os = 'Android';
	}

	if (/Edge|Edg/i.test(ua)) browser = 'Edge';
	else if (/OPR|Opera/i.test(ua)) browser = 'Opera';
	else if (/Chrome/i.test(ua)) browser = 'Chrome';
	else if (/Safari/i.test(ua)) browser = 'Safari';
	else if (/Firefox/i.test(ua)) browser = 'Firefox';

	return { os, browser };
}

export function checkIfTouchDevice(): boolean {
	if (typeof window === 'undefined') return false;
	// Check for fine pointer (mouse) as primary input method
	const hasFinePrimaryPointer = window.matchMedia('(pointer: fine)').matches;
	// Check if touch is available as a secondary input
	const hasTouchCapability = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
	// Consider it a touch device only if fine pointer is not primary or touch points > 1
	return !hasFinePrimaryPointer || (hasTouchCapability && navigator.maxTouchPoints > 1);
}

export function getSafeAreaPadding(): { top: number; bottom: number; left: number; right: number } {
	if (window.flutterSafeAreaInsets) {
		return {
			top: window.flutterSafeAreaInsets.top,
			bottom: window.flutterSafeAreaInsets.bottom,
			left: window.flutterSafeAreaInsets.left,
			right: window.flutterSafeAreaInsets.right
		};
	}

	return {
		top: 0,
		bottom: 0,
		left: 0,
		right: 0
	};
}

export function checkWrapperVersion() {
	if (!window.wrapperVersion) {
		return;
	}

	fetch('https://api.github.com/repos/Mauznemo/CrypthoraChatWrapper/releases/latest')
		.then((response) => {
			if (!response.ok) {
				console.error(`HTTP error! status: ${response.status}`);
			}
			return response.json();
		})
		.then((data) => {
			const latestVersion = data.tag_name.replace('v', '');

			if (window.wrapperVersion !== latestVersion) {
				if (localStorage.getItem('ignoreWrapperUpdate') === latestVersion) {
					console.log('Ignoring wrapper update');
					return;
				}

				modalStore.open({
					title: get(t)('app.wrapper.update-available'),
					content: get(t)('app.wrapper.update-available-content', {
						values: { newVersion: latestVersion, currentVersion: window.wrapperVersion }
					}),
					buttons: [
						{
							text: get(t)('common.download'),
							variant: 'primary',
							onClick: () => {
								window.open(
									'https://github.com/Mauznemo/CrypthoraChatWrapper/releases/latest',
									'_blank'
								);
							}
						},
						{
							text: get(t)('common.ignore'),
							variant: 'secondary',
							onClick: () => {
								localStorage.setItem('ignoreWrapperUpdate', latestVersion);
							}
						}
					]
				});
			}
		})
		.catch((error) => {
			console.error('Could not fetch latest release:', error);
		});
}
