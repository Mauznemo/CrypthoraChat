<script lang="ts">
	import { modalStore } from '$lib/stores/modal.svelte.js';
	import { onMount } from 'svelte';
	import { expoInOut } from 'svelte/easing';
	import { fade, scale } from 'svelte/transition';

	let modalElement: HTMLElement;
	let open: boolean = $state(false);

	// Watch for store changes and update modal accordingly
	$effect(() => {
		if (modalStore.isOpen) {
			console.log('Opening modal with title:', modalStore.config.title);
			//modalElement.showModal();
			open = true;
		} else {
			//modalElement.close();
			console.log('Closing modal');
			open = false;
		}
	});

	function handleBackdropClick(event: MouseEvent) {
		if (open) {
			modalStore.close();
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			modalStore.close();
		}
	}

	function getButtonClasses(variant: string = 'primary') {
		const baseClasses =
			'frosted-glass px-4 py-2 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-full';

		switch (variant) {
			case 'primary':
				return `${baseClasses} bg-teal-600/40 text-white hover:bg-teal-500/40 focus:ring-blue-500`;
			case 'secondary':
				return `${baseClasses} bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600`;
			case 'danger':
				return `${baseClasses} bg-red-600 text-white hover:bg-red-700 focus:ring-red-500`;
			default:
				return `${baseClasses} bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500`;
		}
	}
</script>

{#if open}
	<div
		in:fade={{ duration: 200 }}
		out:fade={{ duration: 200 }}
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		onclick={handleBackdropClick}
		onkeydown={handleKeyDown}
		role="dialog"
		aria-modal="true"
		tabindex="0"
	>
		<!-- Modal -->
		<div
			in:scale={{ duration: 200, easing: expoInOut }}
			out:scale={{ duration: 200, easing: expoInOut }}
			class="frosted-glass-shadow m-4 max-h-[90vh] w-full max-w-lg overflow-auto rounded-4xl bg-gray-800/60 p-6"
		>
			<!-- Header -->
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-xl font-semibold text-gray-100">
					{modalStore.config.title}
				</h2>
				{#if modalStore.config.showCloseButton}
					<button
						onclick={() => modalStore.close()}
						class="p-1 text-gray-400 transition-colors hover:text-gray-200"
						aria-label="Close modal"
					>
						<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							></path>
						</svg>
					</button>
				{/if}
			</div>

			<!-- Content -->
			<div class="mb-6 whitespace-pre-wrap text-gray-300">
				{modalStore.config.content}
			</div>

			<!-- Buttons -->
			{#if modalStore.config.buttons && modalStore.config.buttons.length > 0}
				<div class="flex justify-end gap-3">
					{#each modalStore.config.buttons as button}
						<button onclick={button.onClick} class={getButtonClasses(button.variant)}>
							{button.text}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}
