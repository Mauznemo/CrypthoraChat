import {
	clearChatNotificationState,
	recordChatNotification,
	totalNotificationCount,
	type ChatNotification
} from '$lib/notificationState';
import { playNotificationSound } from '$lib/notificationSound';
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

	/**
	 * Shows (or replaces) the single notification for a chat.
	 *
	 * Goes through the service worker registration rather than `new Notification` so that the
	 * tag based replacement, and `getNotifications` when the chat is opened, behave the same as
	 * for notifications raised by a push while the app was closed.
	 */
	async showChatNotification(entry: ChatNotification): Promise<void> {
		if (!this.isSupported || this.permission !== 'granted' || window.isFlutterWebView) return;

		try {
			const registration = await navigator.serviceWorker.ready;
			await registration.showNotification(buildNotificationTitle(entry), {
				body: buildNotificationBody(entry),
				badge: '/icon-badge-96x96.png',
				icon: entry.imageUrl,
				// One notification per chat: a new message replaces the chat's existing one instead
				// of stacking up next to it.
				tag: entry.chatId,
				renotify: true,
				requireInteraction: false,
				data: { chatId: entry.chatId, groupType: entry.groupType, timestamp: entry.timestamp }
			} as NotificationOptions);

			void playNotificationSound();
		} catch (error) {
			console.error('Error showing notification:', error);
		}
	}

	/** Dismisses a chat's notification and forgets its unread count, leaving other chats alone. */
	async clearChat(chatId: string): Promise<void> {
		if (!this.isSupported || window.isFlutterWebView) return;

		await clearChatNotificationState(chatId);

		try {
			const registration = await navigator.serviceWorker.ready;
			const notifications = await registration.getNotifications({ tag: chatId });
			for (const notification of notifications) notification.close();
		} catch (error) {
			console.error('Error clearing notifications:', error);
		}

		await updateAppBadge();
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

/** Group chats are titled by the chat, DMs by the sender, same as in the wrapper app. */
export function buildNotificationTitle(entry: ChatNotification): string {
	return entry.groupType === 'group' ? entry.chatName || entry.username : entry.username;
}

/**
 * A count aware body, so a chat with several unread messages says how many rather than only
 * showing the latest one.
 */
export function buildNotificationBody(entry: ChatNotification): string {
	const { count, username, chatName } = entry;

	if (entry.groupType === 'group') {
		return count > 1
			? get(t)('notifications.new-messages-group', { values: { count, chatName } })
			: get(t)('notifications.new-message-group', { values: { username, chatName } });
	}

	return count > 1
		? get(t)('notifications.new-messages-dm', { values: { count, username } })
		: get(t)('notifications.new-message-dm', { values: { username } });
}

/** Repaints the app icon badge from the stored per-chat counts, or removes it at zero. */
export async function updateAppBadge(): Promise<void> {
	if (!('setAppBadge' in navigator)) return;

	const total = await totalNotificationCount();
	try {
		if (total > 0) await navigator.setAppBadge(total);
		else await navigator.clearAppBadge();
	} catch (error) {
		console.error('Error updating app badge:', error);
	}
}

export async function showChatNotification(
	username: string,
	chatId: string,
	groupType: 'dm' | 'group' = 'dm',
	chatName?: string,
	imageUrl?: string
): Promise<void> {
	const entry = await recordChatNotification({
		chatId,
		username,
		chatName,
		groupType,
		imageUrl,
		timestamp: Date.now()
	});

	await notificationStore.showChatNotification(entry);
	await updateAppBadge();
}
