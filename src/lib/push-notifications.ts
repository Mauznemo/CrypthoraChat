import { notificationStore } from './stores/notifications.svelte';
import { socketStore } from './stores/socket.svelte';

export async function initializePushNotifications(vapidPublicKey: string) {
	// Register service worker
	// if ('serviceWorker' in navigator) {
	// 	try {
	// 		const registration = await navigator.serviceWorker.register('/service-worker.js');
	// 		console.log('Service worker registered:', registration);
	// 	} catch (error) {
	// 		console.error('Service worker registration failed:', error);
	// 	}
	// }

	// Request notification permission
	const hasPermission = await notificationStore.requestPermission();
	if (!hasPermission) {
		console.log('Notification permission denied');
		return;
	}

	// Subscribe to push notifications
	const subscription = await notificationStore.subscribe(vapidPublicKey);
	if (subscription) {
		// Send subscription to your server
		socketStore.subscribeToPush(subscription);
		console.log('Subscribed to push notifications');
	}
}
