<script lang="ts">
	import { t } from 'svelte-i18n';

	async function resetServiceWorkers(): Promise<void> {
		if ('serviceWorker' in navigator) {
			const registrations = await navigator.serviceWorker.getRegistrations();
			for (const registration of registrations) {
				await registration.unregister();
				console.log('Service worker unregistered:', registration);
			}
			window.location.reload();
		}
	}

	async function clearCaches(): Promise<void> {
		if ('caches' in window) {
			const cacheNames = await caches.keys();
			for (const name of cacheNames) {
				await caches.delete(name);
				console.log('Cache deleted:', name);
			}
		}
	}
</script>

<div class="flex flex-col items-start gap-2">
	<p class="mt-4 mb-1 text-lg font-bold">{$t('settings.advanced.service-worker')}</p>
	<button
		onclick={resetServiceWorkers}
		class="cursor-pointer rounded-full bg-red-800/40 px-4 py-2 text-white frosted-glass hover:bg-red-600/40"
		>{$t('settings.advanced.reset-sw')}</button
	>
	<button
		onclick={clearCaches}
		class="cursor-pointer rounded-full bg-red-800/40 px-4 py-2 text-white frosted-glass hover:bg-red-600/40"
		>{$t('settings.advanced.clear-cache')}</button
	>
</div>
