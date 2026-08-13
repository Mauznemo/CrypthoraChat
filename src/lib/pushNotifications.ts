import { notificationStore } from './stores/notifications.svelte';
import { socketStore } from './stores/socket.svelte';
import { PUBLIC_VAPID_KEY } from '$env/static/public';
import { browser } from '$app/environment';
import { modalStore } from './stores/modal.svelte';

export async function initializePushNotifications() {
	if (!browser) return;

	// The wrapper app handles its own notifications, it tells us which provider it registered with
	if (window.isFlutterWebView && window.fcmToken) {
		socketStore.subscribeToFcmPush(window.fcmToken);
		return;
	}

	if (window.isFlutterWebView && window.ntfyTopic) {
		socketStore.subscribeToNtfyPush(window.ntfyTopic);
		return;
	}

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
		socketStore.subscribeToWebPush(subscription);
		console.log('Subscribed to push notifications');
	}
}
