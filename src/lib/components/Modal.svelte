<script lang="ts">
	import { modalStore } from '$lib/stores/modal.svelte.js';
	import Icon from '@iconify/svelte';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
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
		if (
			open &&
			(modalStore.config.dismissible === true || modalStore.config.dismissible === undefined)
		) {
			modalStore.close();
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (
			event.key === 'Escape' &&
			(modalStore.config.dismissible === true || modalStore.config.dismissible === undefined)
		) {
			modalStore.close();
		}
	}

	function getButtonClasses(variant: string = 'primary', outlined: boolean = false) {
		let baseClasses =
			'frosted-glass px-4 py-2 font-medium transition-colors rounded-full cursor-pointer disabled:bg-gray-600/60 disabled:text-gray-400 disabled:hover:bg-gray-600/60 disabled:hover:text-gray-400';

		if (outlined) {
			baseClasses += ' outline outline-4 outline-orange-600';
		}

		switch (variant) {
			case 'primary':
				return `${baseClasses} bg-accent-700/60 text-white hover:bg-accent-600/50 focus:ring-blue-500`;
			case 'secondary':
				return `${baseClasses} focus:ring-gray-500 bg-gray-700 text-gray-100 hover:bg-gray-600`;
			case 'danger':
				return `${baseClasses} bg-red-800/40 text-white hover:bg-red-600/40 focus:ring-red-500`;
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
			class="m-4 max-h-[90vh] w-full max-w-lg overflow-auto rounded-4xl bg-gray-800/60 p-6 frosted-glass-shadow"
		>
			<!-- Header -->
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-xl font-semibold text-gray-100">
					{modalStore.config.title}
				</h2>
				{#if modalStore.config.showCloseButton}
					<button
						onclick={() => modalStore.close()}
						class="cursor-pointer p-1 text-gray-400 transition-colors hover:text-gray-200"
						aria-label="Close modal"
					>
						<Icon icon="mdi:close" class="size-6" />
					</button>
				{/if}
			</div>

			{#if modalStore.config.customContent}
				{@render modalStore.config.customContent?.()}
			{/if}

			<!-- Content -->
			<div class="mb-6 whitespace-pre-wrap text-gray-300">
				{modalStore.config.content}
			</div>

			<!-- Buttons -->
			{#if modalStore.config.buttons && modalStore.config.buttons.length > 0}
				<div
					class={modalStore.config.buttonAlignment === undefined ||
					modalStore.config.buttonAlignment === 'horizontal'
						? 'flex justify-end gap-3'
						: 'flex flex-col items-stretch gap-3'}
				>
					{#each modalStore.config.buttons as button}
						<button
							onclick={() => {
								button.onClick?.();
								modalStore.close();
							}}
							disabled={button.disabled === true}
							class={getButtonClasses(button.variant, button.outlined)}
						>
							{button.text}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}
