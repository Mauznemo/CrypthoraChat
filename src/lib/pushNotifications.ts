import { notificationStore } from './stores/notifications.svelte';
import { socketStore } from './stores/socket.svelte';
import { PUBLIC_VAPID_KEY } from '$env/static/public';
import { browser } from '$app/environment';

export async function initializePushNotifications() {
	if (!browser) return;

	// Request notification permission
	const hasPermission = await notificationStore.requestPermission();
	if (!hasPermission) {
		console.log('Notification permission denied');
		return;
	}

	// Subscribe to push notifications
	const subscription = await notificationStore.subscribe(PUBLIC_VAPID_KEY);
	if (subscription) {
		// Send subscription to your server
		socketStore.subscribeToPush(subscription);
		console.log('Subscribed to push notifications');
	}
}
