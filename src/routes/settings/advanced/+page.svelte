<script lang="ts">
	import Toggle from '$lib/components/Toggle.svelte';
	import { developer } from '$lib/utils/debug';
	import { linkConfirmation } from '$lib/utils/linkConfirmation';
	import { isPwaStandalone } from '$lib/utils/device';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';

	let showDebugInfo = $state(false);
	let confirmLinks = $state(true);
	let isPwa = $state(false);

	onMount(() => {
		showDebugInfo = developer.showDebugInfo();
		confirmLinks = linkConfirmation.isEnabled();
		isPwa = isPwaStandalone();
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
	<Toggle
		bind:checked={showDebugInfo}
		label={$t('settings.advanced.show-debug-info')}
		onchange={(checked) => developer.setDebug(checked)}
	/>
	{#if isPwa}
		<Toggle
			bind:checked={confirmLinks}
			label={$t('settings.advanced.confirm-links')}
			onchange={(checked) => linkConfirmation.setEnabled(checked)}
		/>
	{/if}
</div>
