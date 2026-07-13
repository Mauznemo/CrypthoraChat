<script lang="ts">
	import type * as PdfJsLib from 'pdfjs-dist';
	import LoadingSpinner from '../LoadingSpinner.svelte';

	let workerConfigured = false;

	async function loadPdfJs() {
		const pdfjsLib = await import('pdfjs-dist');
		if (!workerConfigured) {
			const { default: pdfWorkerUrl } = await import(
				'pdfjs-dist/build/pdf.worker.min.mjs?url'
			);
			pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
			workerConfigured = true;
		}
		return pdfjsLib;
	}

	const {
		src,
		page = 1,
		maxWidth,
		maxHeight,
		onload,
		onerror
	}: {
		src: string;
		page?: number;
		maxWidth: number;
		maxHeight: number;
		onload?: (info: { pageCount: number }) => void;
		onerror?: () => void;
	} = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let loading = $state(true);
	let failed = $state(false);

	$effect(() => {
		const currentSrc = src;
		const currentPage = page;
		const currentCanvas = canvas;
		if (!currentCanvas) return;

		let cancelled = false;
		let renderTask: PdfJsLib.RenderTask | undefined;

		loading = true;
		failed = false;

		(async () => {
			try {
				const pdfjsLib = await loadPdfJs();
				if (cancelled) return;

				const pdf = await pdfjsLib.getDocument({ url: currentSrc }).promise;
				if (cancelled) return;

				const pdfPage = await pdf.getPage(currentPage);
				if (cancelled) return;

				const unscaledViewport = pdfPage.getViewport({ scale: 1 });
				const scale = Math.min(
					maxWidth / unscaledViewport.width,
					maxHeight / unscaledViewport.height
				);
				const viewport = pdfPage.getViewport({ scale });

				// Render at devicePixelRatio for crispness, but keep the CSS box pinned to the
				// computed viewport size so the canvas can never visually exceed maxWidth/maxHeight.
				const pixelRatio = window.devicePixelRatio || 1;
				currentCanvas.width = viewport.width * pixelRatio;
				currentCanvas.height = viewport.height * pixelRatio;
				currentCanvas.style.width = `${viewport.width}px`;
				currentCanvas.style.height = `${viewport.height}px`;
				const context = currentCanvas.getContext('2d');
				if (!context) throw new Error('Canvas context unavailable');
				context.scale(pixelRatio, pixelRatio);

				renderTask = pdfPage.render({ canvasContext: context, viewport, canvas: currentCanvas });
				await renderTask.promise;
				if (cancelled) return;

				loading = false;
				onload?.({ pageCount: pdf.numPages });
			} catch (e) {
				if (!cancelled) {
					console.error('Failed to render PDF page', e);
					loading = false;
					failed = true;
					onerror?.();
				}
			}
		})();

		return () => {
			cancelled = true;
			renderTask?.cancel();
		};
	});
</script>

<div
	class="relative flex items-center justify-center overflow-hidden"
	style="width: {maxWidth}px; height: {maxHeight}px;"
>
	{#if loading}
		<LoadingSpinner size="1.5rem" />
	{/if}
	{#if !failed}
		<canvas bind:this={canvas} class="max-w-full rounded {loading ? 'hidden' : ''}"></canvas>
	{/if}
</div>
