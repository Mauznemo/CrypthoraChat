<script lang="ts">
	import { documentPreviewStore } from '$lib/stores/documentPreview.svelte';
	import { fileUtils } from '$lib/chat/fileUtils';
	import Icon from '@iconify/svelte';
	import { expoInOut } from 'svelte/easing';
	import { fade, scale } from 'svelte/transition';
	import PdfCanvas from './PdfCanvas.svelte';

	let pdfPage = $state(1);
	let pdfPageCount = $state(1);
	let pdfContainer: HTMLDivElement | undefined = $state();
	let pdfContainerWidth = $state(600);
	let pdfContainerHeight = $state(600);

	$effect(() => {
		if (!documentPreviewStore.isOpen) {
			pdfPage = 1;
			pdfPageCount = 1;
		}
	});
</script>

{#if documentPreviewStore.isOpen}
	<div
		in:fade={{ duration: 200 }}
		out:fade={{ duration: 200 }}
		class="fixed inset-0 z-50 flex h-full w-full items-center justify-center bg-black/50 p-2 md:p-10"
	>
		<div
			in:scale={{ duration: 200, easing: expoInOut }}
			out:scale={{ duration: 200, easing: expoInOut }}
			class="relative flex max-h-full max-w-full items-center justify-center rounded-4xl bg-gray-800/60 p-3 frosted-glass-shadow md:p-4"
		>
			<button
				onclick={() => documentPreviewStore.close()}
				class="absolute top-5 right-16 z-10 cursor-pointer rounded-lg bg-gray-500/50 p-1 text-gray-300 transition-colors hover:bg-gray-500/60 hover:text-gray-200"
				aria-label="Close modal"
			>
				<Icon icon="mdi:close" class="size-6" />
			</button>
			<button
				onclick={() =>
					fileUtils.downloadFileFromUrl(documentPreviewStore.src, documentPreviewStore.name)}
				class="absolute top-5 right-5 z-10 cursor-pointer rounded-lg bg-gray-500/50 p-1 text-gray-300 transition-colors hover:bg-gray-500/60 hover:text-gray-200"
				aria-label="Download"
			>
				<Icon icon="mdi:tray-download" class="size-6" />
			</button>

			{#if documentPreviewStore.type === 'html'}
				<div class="h-[85dvh] w-[90dvw] overflow-hidden rounded-xl bg-white md:w-[75dvw]">
					<iframe
						src={documentPreviewStore.src}
						title={documentPreviewStore.name}
						sandbox=""
						class="h-full w-full border-none"
					></iframe>
				</div>
			{:else}
				<div
					class="flex h-[85dvh] w-[90dvw] flex-col items-center justify-center gap-3 md:w-[75dvw]"
				>
					<div
						bind:this={pdfContainer}
						bind:clientWidth={pdfContainerWidth}
						bind:clientHeight={pdfContainerHeight}
						class="flex max-h-[calc(100%-3rem)] max-w-full flex-1 items-center justify-center overflow-hidden"
					>
						{#if pdfContainer}
							{#key documentPreviewStore.src + pdfPage}
								<PdfCanvas
									src={documentPreviewStore.src}
									page={pdfPage}
									maxWidth={pdfContainerWidth}
									maxHeight={pdfContainerHeight}
									onload={({ pageCount }) => (pdfPageCount = pageCount)}
								/>
							{/key}
						{/if}
					</div>
					{#if pdfPageCount > 1}
						<div class="flex items-center gap-3 rounded-lg bg-gray-500/50 px-3 py-2">
							<button
								onclick={() => (pdfPage = Math.max(1, pdfPage - 1))}
								disabled={pdfPage <= 1}
								class="cursor-pointer rounded-lg p-1 text-gray-300 transition-colors hover:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
								aria-label="Previous page"
							>
								<Icon icon="mdi:chevron-left" class="size-5" />
							</button>
							<span class="text-sm text-gray-200">{pdfPage} / {pdfPageCount}</span>
							<button
								onclick={() => (pdfPage = Math.min(pdfPageCount, pdfPage + 1))}
								disabled={pdfPage >= pdfPageCount}
								class="cursor-pointer rounded-lg p-1 text-gray-300 transition-colors hover:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
								aria-label="Next page"
							>
								<Icon icon="mdi:chevron-right" class="size-5" />
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	:global(body:has(.fixed.inset-0)) {
		overflow: hidden;
	}
</style>
