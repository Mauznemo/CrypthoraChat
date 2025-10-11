<script lang="ts">
	import { imagePreviewStore } from '$lib/stores/imagePreview.svelte';
	import Icon from '@iconify/svelte';
	import { expoInOut } from 'svelte/easing';
	import { fade, scale } from 'svelte/transition';

	let zoom = $state(1);
	let translateX = $state(0);
	let translateY = $state(0);
	let isDragging = $state(false);
	let startX = $state(0);
	let startY = $state(0);
	let imgElement: HTMLImageElement;

	const MIN_ZOOM = 1;
	const MAX_ZOOM = 10;
	const ZOOM_STEP = 0.3;

	function zoomIn() {
		if (zoom < MAX_ZOOM) {
			zoom = Math.min(zoom + ZOOM_STEP * zoom, MAX_ZOOM);
		}
	}

	function zoomOut() {
		if (zoom > MIN_ZOOM) {
			zoom = Math.max(zoom - ZOOM_STEP * zoom, MIN_ZOOM);
			if (zoom === MIN_ZOOM) {
				translateX = 0;
				translateY = 0;
			}
		}
	}

	function handlePointerDown(e: PointerEvent) {
		if (zoom > MIN_ZOOM) {
			e.preventDefault();
			isDragging = true;
			startX = e.clientX - translateX * zoom;
			startY = e.clientY - translateY * zoom;
			if (imgElement) {
				imgElement.style.cursor = 'grabbing';
			}
		}
	}

	function handlePointerMove(e: PointerEvent) {
		if (isDragging && zoom > MIN_ZOOM) {
			e.preventDefault();
			translateX = (e.clientX - startX) / zoom;
			translateY = (e.clientY - startY) / zoom;
		}
	}

	function handlePointerUp() {
		isDragging = false;
		if (imgElement) {
			imgElement.style.cursor = zoom > MIN_ZOOM ? 'grab' : 'default';
		}
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		if (e.deltaY < 0) {
			zoomIn();
		} else {
			zoomOut();
		}
	}

	function resetZoom() {
		zoom = MIN_ZOOM;
		translateX = 0;
		translateY = 0;
	}

	$effect(() => {
		if (!imagePreviewStore.isOpen) {
			resetZoom();
		}
	});
</script>

<svelte:window onpointerup={handlePointerUp} onpointermove={handlePointerMove} />

{#if imagePreviewStore.isOpen}
	<div
		in:fade={{ duration: 200 }}
		out:fade={{ duration: 200 }}
		class="fixed inset-0 z-50 flex h-full w-full items-center justify-center bg-black/50 p-2 md:p-10"
		style="touch-action: none; overscroll-behavior: none;"
		onwheel={handleWheel}
	>
		<div
			in:scale={{ duration: 200, easing: expoInOut }}
			out:scale={{ duration: 200, easing: expoInOut }}
			class="relative flex max-h-full max-w-full items-center justify-center rounded-4xl bg-gray-800/60 p-3 frosted-glass-shadow md:p-4"
		>
			<button
				onclick={() => imagePreviewStore.close()}
				class="absolute top-5 right-5 z-10 cursor-pointer rounded-lg bg-gray-500/50 p-1 text-gray-300 transition-colors hover:bg-gray-500/60 hover:text-gray-200"
				aria-label="Close modal"
			>
				<Icon icon="mdi:close" class="size-6" />
			</button>
			<div
				class="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 gap-2 rounded-lg bg-gray-500/50 p-2"
			>
				<button
					onclick={zoomOut}
					disabled={zoom <= MIN_ZOOM}
					class="cursor-pointer rounded-lg bg-gray-600/50 p-2 text-gray-300 transition-colors hover:bg-gray-600/60 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
					aria-label="Zoom out"
				>
					<Icon icon="mdi:minus" class="size-5" />
				</button>
				<button
					onclick={resetZoom}
					disabled={zoom === MIN_ZOOM}
					class="cursor-pointer rounded-lg bg-gray-600/50 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-600/60 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
					aria-label="Reset zoom"
				>
					{Math.round(zoom * 100)}%
				</button>
				<button
					onclick={zoomIn}
					disabled={zoom >= MAX_ZOOM}
					class="cursor-pointer rounded-lg bg-gray-600/50 p-2 text-gray-300 transition-colors hover:bg-gray-600/60 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
					aria-label="Zoom in"
				>
					<Icon icon="mdi:plus" class="size-5" />
				</button>
			</div>
			<div
				class="flex max-h-[90dvh] min-h-[80dvh] min-w-[90dvw] items-center justify-center overflow-hidden rounded-xl md:min-w-[60dvw]"
			>
				{#key Math.round(zoom * 10)}
					<img
						bind:this={imgElement}
						src={imagePreviewStore.src}
						alt="Preview"
						class="max-h-[88dvh] max-w-full rounded-xl object-contain select-none"
						style="transform: scale({zoom}) translate({translateX}px, {translateY}px); transform-origin: center center; cursor: {zoom >
						MIN_ZOOM
							? 'grab'
							: 'default'}; will-change: transform;"
						onpointerdown={handlePointerDown}
						draggable="false"
					/>
				{/key}
			</div>
		</div>
	</div>
{/if}

<style>
	:global(body:has(.fixed.inset-0)) {
		overflow: hidden;
	}
</style>
