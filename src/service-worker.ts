/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = `cache-${version}`;
const ASSETS_TO_CACHE = [...build, ...files];

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

self.addEventListener('fetch', (event) => {
	// ignore POST requests etc
	if (event.request.method !== 'GET') return;
	console.log('Fetch event for:', event.request.url);

	async function respond() {
		const url = new URL(event.request.url);
		const cache = await caches.open(CACHE_NAME);

		// `build`/`files` can always be served from the cache
		if (ASSETS_TO_CACHE.includes(url.pathname)) {
			const response = await cache.match(url.pathname);

			if (response) {
				console.log(`Returning from Cache`, url.pathname);
				return response;
			}
		}

		// for everything else, try the network first with a timeout, but
		// fall back to the cache if we're offline or it times out
		try {
			// Race fetch against a timeout promise
			const response = await Promise.race([
				fetch(event.request),
				new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 2000))
			]);

			// const response = await fetch(event.request);

			// if we're offline, fetch can return a value that is not a Response
			// instead of throwing - and we can't pass this non-Response to respondWith
			if (!(response instanceof Response)) {
				throw new Error('invalid response from fetch');
			}

			if (response.status === 200) {
				console.log(`Adding to Cache`, event.request.url);
				cache.put(event.request, response.clone());
			}

			return response;
		} catch (err) {
			const response = await cache.match(event.request);

			if (response) {
				console.log(`Returning from Cache`, event.request.url);
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

// Push notification handling
self.addEventListener('push', (event) => {
	console.log('Push notification received');
	const options = {
		body: 'You have a new message!',
		icon: '/icon-192.png',
		badge: '/icon-192.png',
		// vibrate: [100, 50, 100],
		data: {
			dateOfArrival: Date.now(),
			primaryKey: '1'
		},
		actions: [
			{
				action: 'explore',
				title: 'Open Chat',
				icon: '/icon-192.png'
			},
			{
				action: 'close',
				title: 'Close notification',
				icon: '/icon-192.png'
			}
		]
	};

	if (event.data) {
		const data = event.data.json();
		console.log('Push notification data:', data);
		options.body = data.message || options.body;
		options.data = { ...options.data, ...data };
	}

	event.waitUntil(self.registration.showNotification('New Message', options));
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	if (event.action === 'explore') {
		event.waitUntil(self.clients.openWindow('/'));
	}
});
