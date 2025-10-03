export function getDeviceInfo() {
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
