<script lang="ts">
	import { fileUtils } from '$lib/chat/fileUtils';
	import { getQuota, getUsage, idb } from '$lib/idb';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { onMount } from 'svelte';

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
		toastStore.success('Cached media cleared');
		totalStorage = await getQuota();
		usedStorage = await getUsage();
		freeStorage = totalStorage - usedStorage;
	}
</script>

<p class="mt-4 mb-5 text-lg font-bold">
	Used {fileUtils.formatFileSize(usedStorage)} from {fileUtils.formatFileSize(totalStorage)} ({(
		(usedStorage / totalStorage) *
		100
	).toFixed(2)}% used)
</p>

<button
	onclick={handleClearCachedMedia}
	class="cursor-pointer rounded-full bg-red-800/40 px-4 py-2 text-white frosted-glass hover:bg-red-600/40"
	>Clear cached media</button
>
