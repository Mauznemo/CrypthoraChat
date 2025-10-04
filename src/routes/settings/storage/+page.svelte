<script lang="ts">
	import { fileUtils } from '$lib/chat/fileUtils';
	import { getQuota, getUsage, idb } from '$lib/idb';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';

	let usedStorage = $state(0);
	let freeStorage = $state(0);
	let totalStorage = $state(0);

	onMount(async () => {
		totalStorage = await getQuota();
		usedStorage = await getUsage();
		freeStorage = totalStorage - usedStorage;
	});

	async function handleClearCachedMedia() {
		await idb!.clear('files');
		toastStore.success($t('settings.storage.clear-media-success'));
		totalStorage = await getQuota();
		usedStorage = await getUsage();
		freeStorage = totalStorage - usedStorage;
	}
</script>

<p class="mt-4 mb-5 text-lg font-bold">
	{$t('settings.storage.used', {
		values: {
			usedStorage: fileUtils.formatFileSize(usedStorage),
			totalStorage: fileUtils.formatFileSize(totalStorage),
			percentage: ((usedStorage / totalStorage) * 100).toFixed(2)
		}
	})}
</p>

<button
	onclick={handleClearCachedMedia}
	class="cursor-pointer rounded-full bg-red-800/40 px-4 py-2 text-white frosted-glass hover:bg-red-600/40"
	>{$t('settings.storage.clear-media')}</button
>
