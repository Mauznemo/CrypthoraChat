import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';

class NotificationStore {
	isSupported = $state(false);
	permission = $state<NotificationPermission>('default');
	subscription = $state<PushSubscription | null>(null);

	constructor() {
		if (typeof window !== 'undefined') {
			this.isSupported =
				'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

			this.permission = this.isSupported ? Notification.permission : 'default';
		}
	}

	async requestPermission() {
		if (!this.isSupported) return false;

		const permission = await Notification.requestPermission();
		this.permission = permission;
		return permission === 'granted';
	}

	async subscribe(vapidPublicKey: string) {
		if (!this.isSupported || this.permission !== 'granted') return null;

		try {
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey)
			});

			this.subscription = subscription;
			return subscription;
		} catch (error) {
			console.error('Error subscribing to push notifications:', error);
			return null;
		}
	}

	async showNotification(
		title: string,
		body: string,
		chatId?: string,
		groupType?: 'dm' | 'group'
	): Promise<void> {
		if (!this.isSupported || this.permission !== 'granted' || window.isFlutterWebView) return;

		try {
			const notification = new Notification(title, {
				body,
				badge: '/icon-badge-96x96.png',
				// icon: '/icon-192x192.png', // Could change based on groupType
				tag: chatId,
				requireInteraction: false,
				data: {
					chatId,
					groupType,
					timestamp: Date.now()
				}
			});

			notification.onclick = (event) => {
				event.preventDefault();
				window.focus();

				if (chatId) {
					if (browser) {
						goto(`/chat?chatId=${chatId}`);
					}
				}

				notification.close();
			};
		} catch (error) {
			console.error('Error showing notification:', error);
		}
	}

	private urlBase64ToUint8Array(base64String: string) {
		const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
		const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

		const rawData = window.atob(base64);
		const outputArray = new Uint8Array(rawData.length);

		for (let i = 0; i < rawData.length; ++i) {
			outputArray[i] = rawData.charCodeAt(i);
		}
		return outputArray;
	}
}

export const notificationStore = new NotificationStore();

export async function showChatNotification(
	username: string,
	chatId: string,
	groupType: 'dm' | 'group' = 'dm',
	chatName?: string
): Promise<void> {
	let body: string;

	if (groupType === 'group') {
		body = get(t)('notifications.new-message-group', { values: { username, chatName } });
	} else {
		body = get(t)('notifications.new-message-dm', { values: { username } });
	}

	await notificationStore.showNotification(username, body, chatId, groupType);
}
