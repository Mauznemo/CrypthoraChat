<script lang="ts">
	import { goto } from '$app/navigation';
	import { chatStore } from '$lib/stores/chat.svelte';
	import type { SafeUser } from '$lib/types';
	import type { Snippet } from 'svelte';

	let {
		children
	}: {
		children: Snippet<[]>;
	} = $props();

	let isOpen = $state(false);

	export function toggle(): void {
		isOpen = !isOpen;
	}
</script>

<div
	class={`
		fixed
		z-50
		h-full w-80
		min-w-80 border-r
		border-gray-700
		bg-gray-900/80 backdrop-blur-sm
		 transition-transform
		duration-300 md:static
		md:bg-transparent
		${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
	`}
>
	<button
		onclick={() => goto('/profile')}
		class="flex cursor-pointer items-center justify-start p-2"
	>
		<div
			class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gray-500 text-white"
		>
			<p>{chatStore.user?.username?.[0].toUpperCase()}</p>
		</div>
		<p class="ml-2 line-clamp-1 max-w-[230px] text-2xl font-bold break-all">
			{chatStore.user?.displayName}
		</p>
	</button>
	{@render children()}
</div>

<!-- Backdrop for mobile -->
{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="bg-opacity-50 fixed inset-0 z-40 md:hidden" onclick={toggle}></div>
{/if}
