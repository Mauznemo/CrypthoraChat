export interface NotificationDate {
	groupType: 'dm' | 'group';
	username: string;
	chatId: string;
	timestamp: number;
	chatName?: string;
}

export async function sendNtfyNotification(topic: string, data: NotificationDate) {
	const url = `http://ntfy:80/${topic}`;

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
			console.log('Notification sent successfully');
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
