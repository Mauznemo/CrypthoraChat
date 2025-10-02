<script lang="ts">
	import { page } from '$app/state';
	import BackButton from '$lib/components/BackButton.svelte';
	import { setContext } from 'svelte';

	let { children } = $props();

	let title = $state('Settings');

	setContext('settingsTitle', {
		get value() {
			return title;
		},
		set(newTitle: string) {
			title = newTitle;
		}
	});
</script>

<div class="w-full p-2">
	<div
		class="flex items-center justify-start gap-2 rounded-full bg-accent-600/20 px-5 py-3 frosted-glass-shadow"
	>
		{#if page.url.pathname !== '/settings'}
			<BackButton backPath="/settings" />
		{:else}
			<BackButton backPath="/chat" />
		{/if}
		<h1 class="ml-2 text-3xl font-bold">{title}</h1>
	</div>
	<div class="p-5 px-2 md:px-10">
		{@render children?.()}
	</div>
</div>
