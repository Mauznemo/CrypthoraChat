export interface NotificationDate {
	groupType: 'dm' | 'group';
	username: string;
	chatId: string;
	timestamp: number;
	imageUrl?: string;
	chatName?: string;
}

const NTFY_URL = process.env.NTFY_PUSH_URL || 'http://ntfy:80';

/**
 * ntfy's own topic-name rule. The topic is pasted straight into the request URL, so anything
 * outside this alphabet - a slash, a ".." - could steer the server's POST at another path on the
 * ntfy host.
 */
const NTFY_TOPIC_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidNtfyTopic(topic: string): boolean {
	return NTFY_TOPIC_PATTERN.test(topic);
}

export async function sendNtfyNotification(topic: string, data: NotificationDate) {
	if (!isValidNtfyTopic(topic)) {
		console.error('Refusing to send ntfy notification to invalid topic');
		return false;
	}

	const url = `${NTFY_URL}/${topic}`;

	const headers = {
		'Content-Type': 'application/json'
	};

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: headers,
			body: JSON.stringify(data)
		});

		if (response.ok) {
			return true;
		} else {
			console.error('Failed to send notification:', response.status);
			return false;
		}
	} catch (error) {
		console.error('Error sending notification:', error);
		return false;
	}
}

export async function sendWebpushNotification(
	webpush: any,
	subscription: any,
	data: NotificationDate
) {
	try {
		await webpush.sendNotification(
			subscription,
			JSON.stringify({
				data
			}),
			{ TTL: 86400, urgency: 'high' }
		);

		return true;
	} catch (error) {
		console.error('Error sending webpush notification:', error);
		return false;
	}
}

export function getImageUrl(path: string | null | undefined) {
	if (!path) return undefined;
	// Encoded like every other caller of this endpoint. The wrapper appends its own `&size=`, so a
	// raw path with a reserved character would silently break the avatar in notifications.
	return `${process.env.CHAT_URL}/api/profile-picture?filePath=${encodeURIComponent(path)}`;
}
