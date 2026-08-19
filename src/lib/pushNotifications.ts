import { notificationStore } from './stores/notifications.svelte';
import { socketStore } from './stores/socket.svelte';
import { env } from '$env/dynamic/public';
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

	// Read at runtime, not from $env/static/public: the Dockerfile builds with
	// PUBLIC_VAPID_KEY="placeholder" so the build can run without secrets, and a static import
	// bakes that placeholder into the shipped bundle - which then fails with InvalidAccessError
	// on every subscribe, whatever the operator sets in their environment.
	const vapidKey = env.PUBLIC_VAPID_KEY;
	if (!vapidKey) {
		console.warn('PUBLIC_VAPID_KEY is not set, skipping web push subscription');
		return;
	}

	// Subscribe to push notifications
	const subscription = await notificationStore.subscribe(vapidKey);
	if (subscription) {
		// Send subscription to your server
		socketStore.subscribeToWebPush(subscription);
		console.log('Subscribed to push notifications');
	}
}
