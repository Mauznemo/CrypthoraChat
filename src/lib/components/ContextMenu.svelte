<script lang="ts">
	import { contextMenuStore } from '$lib/stores/contextMenu.svelte';
	import Icon from '@iconify/svelte';
	import { onMount } from 'svelte';
	import { expoInOut } from 'svelte/easing';
	import { fly, scale } from 'svelte/transition';

	let menuElement: HTMLDivElement;

	// Check if we're on mobile
	let isMobile = $state(false);

	onMount(() => {
		const checkMobile = () => {
			isMobile = window.innerWidth < 768;
		};

		checkMobile();
		window.addEventListener('resize', checkMobile);

		// Close menu when clicking outside
		const handleClickOutside = (event: MouseEvent) => {
			if (contextMenuStore.isOpen && menuElement && !menuElement.contains(event.target as Node)) {
				contextMenuStore.close();
			}
		};

		// Close menu on escape key
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && contextMenuStore.isOpen) {
				contextMenuStore.close();
			}
		};

		document.addEventListener('click', handleClickOutside);
		document.addEventListener('keydown', handleKeyDown);

		return () => {
			window.removeEventListener('resize', checkMobile);
			document.removeEventListener('click', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown);
		};
	});
</script>

{#if contextMenuStore.isOpen && !isMobile}
	<div
		bind:this={menuElement}
		in:scale={{ duration: 200, easing: expoInOut }}
		out:scale={{ duration: 200, easing: expoInOut }}
		class="fixed z-50 min-w-48 rounded-2xl bg-gray-800/60 py-2 frosted-glass"
		style="left: {contextMenuStore.position.x}px; top: {contextMenuStore.position.y}px;"
	>
		{#each contextMenuStore.items as item}
			<button
				onclick={() => contextMenuStore.selectItem(item)}
				disabled={item.disabled}
				class="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left text-gray-100 transition-colors first:rounded-t-md last:rounded-b-md hover:bg-gray-600/20 active:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
			>
				<Icon icon={item.icon} class="size-5 text-gray-100" />

				<span class="text-sm font-medium">{item.label}</span>
			</button>
		{/each}
	</div>
{/if}
<!-- Animations don't work with else or else if -->
{#if contextMenuStore.isOpen && isMobile}
	<div class="fixed top-0 right-0 bottom-0 left-0 z-40"></div>
	<!-- Bottom Sheet -->
	<div
		bind:this={menuElement}
		in:fly={{ y: 200, duration: 500, easing: expoInOut }}
		out:fly={{ y: 200, duration: 500, easing: expoInOut }}
		class="fixed right-0 bottom-0 left-0 z-50 rounded-t-4xl bg-gray-800/60 frosted-glass"
	>
		<!-- Handle -->
		<div class="flex justify-center py-3">
			<div class="h-1 w-8 rounded-full bg-gray-600"></div>
		</div>

		<!-- Menu Items -->
		<div class="space-y-1 px-4 pb-6">
			{#each contextMenuStore.items as item}
				<button
					onclick={() => contextMenuStore.selectItem(item)}
					disabled={item.disabled}
					class="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-gray-100 transition-colors hover:bg-gray-800 active:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<Icon icon={item.icon} class="size-6 text-gray-100" />

					<span class="font-medium">{item.label}</span>
				</button>
			{/each}
		</div>
	</div>
{/if}
