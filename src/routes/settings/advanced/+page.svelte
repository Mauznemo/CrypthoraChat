<script lang="ts">
	import { developer } from '$lib/utils/debug';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';

	let showDebugInfo = $state(false);

	onMount(() => {
		showDebugInfo = developer.showDebugInfo();
	});

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
	<label class="flex cursor-pointer items-center gap-3">
		<div class="relative">
			<input
				type="checkbox"
				class="peer sr-only"
				bind:checked={showDebugInfo}
				onchange={(e) => {
					developer.setDebug(showDebugInfo);
				}}
			/>
			<div
				class="peer h-8 w-14 rounded-full bg-gray-700/40 frosted-glass transition-colors peer-checked:bg-accent-600/60"
			></div>
			<div
				class="absolute top-1 left-1 h-6 w-6 rounded-full bg-white transition-transform peer-checked:translate-x-6"
			></div>
		</div>
		<span>{$t('settings.advanced.show-debug-info')}</span>
	</label>
</div>
