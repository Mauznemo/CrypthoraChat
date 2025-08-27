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
	// We ignore requests that aren't for our app's pages.
	//if (event.request.method !== 'GET') return;
	event.respondWith(
		caches.open(CACHE_NAME).then(async (cache) => {
			const cachedResponse = await cache.match(event.request);
			if (cachedResponse) {
				return cachedResponse;
			}

			return fetch(event.request);
		})
	);
});
