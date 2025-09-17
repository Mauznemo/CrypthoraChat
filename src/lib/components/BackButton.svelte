<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '@iconify/svelte';

	const {
		backPath
	}: {
		backPath?: string;
	} = $props();

	function goBack() {
		if (!backPath) {
			history.back();
		} else {
			goto(backPath);
		}
	}
</script>

<button
	onclick={goBack}
	aria-label="Back"
	class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-gray-300/30"
>
	<Icon icon="material-symbols:arrow-back-rounded" class="size-6" />
</button>
