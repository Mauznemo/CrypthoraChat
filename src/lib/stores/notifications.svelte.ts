class NotificationStore {
	isSupported = $state(false);
	permission = $state<NotificationPermission>('default');
	subscription = $state<PushSubscription | null>(null);

	constructor() {
		if (typeof window !== 'undefined') {
			this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
			this.permission = Notification.permission;
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
