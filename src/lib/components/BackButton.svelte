<script>
	import Icon from '@iconify/svelte';
</script>

<button
	onclick={() => history.back()}
	aria-label="Back"
	class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-gray-300/30"
>
	<Icon icon="material-symbols:arrow-back-rounded" class="size-6" />
</button>
