/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';
import i18next from 'i18next';
import { recordChatNotification, totalNotificationCount } from '$lib/notificationState';

const translations = {
	en: {
		translation: {
			'push.new-message-group': 'New Message from {username} in {chatName}',
			'push.new-message-dm': 'New Message from {username}',
			'push.new-messages-group': '{count} new messages in {chatName}',
			'push.new-messages-dm': '{count} new messages from {username}'
		}
	},
	de: {
		translation: {
			'push.new-message-group': 'Neue Nachricht von {username} in {chatName}',
			'push.new-message-dm': 'Neue Nachricht von {username}',
			'push.new-messages-group': '{count} neue Nachrichten in {chatName}',
			'push.new-messages-dm': '{count} neue Nachrichten von {username}'
		}
	}
};

declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = `cache-${version}`;
const ASSETS_TO_CACHE = [...build, ...files];

async function saveLocale(locale: string) {
	const cache = await caches.open('locale');
	await cache.put(
		new Request('/locale'),
		new Response(JSON.stringify({ locale }), {
			headers: { 'Content-Type': 'application/json' }
		})
	);
}

async function getLocale() {
	const cache = await caches.open('locale');
	const response = await cache.match('/locale');
	if (response) {
		const data = await response.json();
		return data.locale;
	}
	return 'en';
}

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			console.log('Opened cache and caching assets');
			return cache.addAll(ASSETS_TO_CACHE);
		})
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((cacheNames) => {
			return Promise.all(
				cacheNames.map((cacheName) => {
					if (cacheName !== CACHE_NAME) {
						console.log('Deleting old cache:', cacheName);
						return caches.delete(cacheName);
					}
				})
			);
		})
	);
});

self.addEventListener('message', (event) => {
	if (event.data?.type === 'SET_LOCALE') {
		let currentLocale = event.data.locale || 'en';
		if (currentLocale.indexOf('-') !== -1) {
			currentLocale = currentLocale.split('-')[0];
		}
		console.log('SW Received SET_LOCALE event', currentLocale);
		saveLocale(currentLocale);
	}
});

self.addEventListener('fetch', (event) => {
	// ignore POST requests etc
	if (event.request.method !== 'GET') return;
	// console.log('Fetch event for:', event.request.url);

	// skip file downloads (example: anything hitting /api/get-encrypted-file-stream)
	if (event.request.url.includes('/api/get-encrypted-file-stream')) {
		// Just let the browser handle it directly
		return;
	}

	async function respond() {
		const url = new URL(event.request.url);
		const cache = await caches.open(CACHE_NAME);

		// `build`/`files` can always be served from the cache
		if (ASSETS_TO_CACHE.includes(url.pathname)) {
			const response = await cache.match(url.pathname);

			if (response) {
				// console.log(`Returning from Cache`, url.pathname);
				return response;
			}
		}

		// for everything else, try the network first with a timeout, but
		// fall back to the cache if we're offline or it times out
		try {
			// Race fetch against a timeout promise
			// const response = await Promise.race([
			// 	fetch(event.request),
			// 	new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 2000))
			// ]);

			const response = await fetch(event.request);

			// if we're offline, fetch can return a value that is not a Response
			// instead of throwing - and we can't pass this non-Response to respondWith
			if (!(response instanceof Response)) {
				throw new Error('invalid response from fetch');
			}

			if (response.status === 200) {
				// console.log(`Adding to Cache`, event.request.url);
				cache.put(event.request, response.clone());
			}

			return response;
		} catch (err) {
			const response = await cache.match(event.request);

			if (response) {
				// console.log(`Returning from Cache`, event.request.url);
				return response;
			}

			// Last resort: return a basic offline page
			if (event.request.mode === 'navigate') {
				console.log('Returning offline page');
				const offlineHTML = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Offline</title>
                        <style>
                            body { font-family: sans-serif; text-align: center; padding: 50px; background: #212121; }
                            button { padding: 10px 20px; font-size: 16px; border-radius: 100px; background: #20a19a; color: #ffffff; }
							p, h1 { color: #ffffff; }
                        </style>
                    </head>
                    <body>
                        <h1>You're Offline</h1>
                        <p>It looks like there's no internet connection. Please check your network and try again.</p>
                        <button onclick="location.reload()">Reload</button>
						<button onclick="history.back()">Go Back</button>
                    </body>
                    </html>
                `;
				return new Response(offlineHTML, {
					headers: { 'Content-Type': 'text/html' }
				});
			}

			// if there's no cache, then just error out
			// as there is nothing we can do to respond to this request
			throw err;
		}
	}

	event.respondWith(respond());
});

self.addEventListener('push', (event) => {
	console.log('Push notification received');

	event.waitUntil(
		(async () => {
			let currentLocale = await getLocale();

			let notificationData = null;
			let title = 'New Message';
			let body = 'Failed to load translation, local: ' + currentLocale;
			let chatId = '';
			let imageUrl: string | undefined;

			if (event.data) {
				try {
					const pushData = event.data.json();
					console.log('Push notification data:', pushData);

					notificationData = pushData.data;

					if (notificationData) {
						const instance = i18next.createInstance();
						await instance.init({
							lng: currentLocale || 'en',
							fallbackLng: 'en',
							resources: translations,
							interpolation: { prefix: '{', suffix: '}' }
						});

						const groupType = notificationData.groupType === 'group' ? 'group' : 'dm';
						const username = notificationData.username || '';
						const chatName = notificationData.chatName || '';
						chatId = notificationData.chatId || '';
						imageUrl = notificationData.imageUrl || undefined;

						// One notification per chat, so the body has to say how many messages are
						// behind it rather than only describing the latest one.
						const entry = await recordChatNotification({
							chatId,
							username,
							chatName,
							groupType,
							imageUrl,
							timestamp: notificationData.timestamp || Date.now()
						});
						const count = entry.count;

						title = groupType === 'group' ? chatName || username : username;

						if (groupType === 'group') {
							body =
								count > 1
									? instance.t('push.new-messages-group', { count, chatName })
									: instance.t('push.new-message-group', { username, chatName });
						} else {
							body =
								count > 1
									? instance.t('push.new-messages-dm', { count, username })
									: instance.t('push.new-message-dm', { username });
						}
					}
				} catch (error) {
					console.error('Error parsing push notification data:', error);
				}
			}

			const options = {
				body: body,
				// The sender's (or the group's) picture, so notifications are not all one browser icon
				icon: imageUrl,
				badge: '/icon-badge-96x96.png',
				// vibrate: [100, 50, 100],
				// Replaces this chat's existing notification instead of stacking a new one next to
				// it. `renotify` keeps the replacement from being delivered silently.
				tag: chatId || undefined,
				renotify: true,
				data: {
					dateOfArrival: Date.now(),
					chatId: chatId,
					notificationData: notificationData
				}
			};

			await self.registration.showNotification(title, options as NotificationOptions);
			await updateAppBadge();
			await requestNotificationSound();
		})()
	);
});

/**
 * Not every platform plays a sound for web notifications (macOS plays none at all), so an open
 * client is asked to play one. Nothing to do when the app is fully closed, a worker has no audio.
 */
async function requestNotificationSound(): Promise<void> {
	const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
	for (const client of clients) client.postMessage({ type: 'PLAY_NOTIFICATION_SOUND' });
}

async function updateAppBadge(): Promise<void> {
	// Not in the worker typings yet, but Chrome does expose the badging API to service workers.
	const badging = navigator as WorkerNavigator & {
		setAppBadge?: (count?: number) => Promise<void>;
		clearAppBadge?: () => Promise<void>;
	};
	if (!badging.setAppBadge) return;

	const total = await totalNotificationCount();
	try {
		if (total > 0) await badging.setAppBadge(total);
		else await badging.clearAppBadge?.();
	} catch (error) {
		console.error('Error updating app badge:', error);
	}
}

self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const chatId = event.notification.data?.chatId;
	const chatUrl = chatId ? `/chat?chatId=${chatId}` : '/chat';

	event.waitUntil(
		(async () => {
			// Reuse an already open window rather than adding a second one next to it. The page
			// exposes `goToChat`, which is also what the wrapper app calls.
			const clients = (await self.clients.matchAll({
				type: 'window',
				includeUncontrolled: true
			})) as WindowClient[];
			const existing = clients.find((client) => client.url.includes('/chat'));

			if (existing) {
				await existing.focus();
				if (chatId) existing.postMessage({ type: 'OPEN_CHAT', chatId });
				return;
			}

			await self.clients.openWindow(chatUrl);
		})()
	);
});
