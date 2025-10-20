<script lang="ts">
	import { developer } from '$lib/utils/debug';
	import { onMount, onDestroy, tick } from 'svelte';
	import type { Snippet } from 'svelte';

	let {
		class: className = '',
		container = $bindable<HTMLElement | null>(),
		handleScroll,
		children
	}: {
		class?: string;
		container?: HTMLElement | null;
		handleScroll?: () => void;
		children: Snippet;
	} = $props();

	let content: HTMLElement | null = null;
	let anchorMessageId: string = $state('');
	let lockedToBottom = $state(true);
	let didResize = false;
	let scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	let showDebugInfo = $state(false);

	function isNearBottom(threshold = 10): boolean {
		if (!container) return false;

		const { scrollTop, scrollHeight, clientHeight } = container;
		const maxScrollTop = scrollHeight - clientHeight;

		return maxScrollTop - scrollTop <= threshold;
	}

	export function lockToBottom(): void {
		lockedToBottom = true;
		container?.scrollTo({
			top: container.scrollHeight,
			behavior: 'smooth'
		});
	}

	function handleWheel(event: Event) {
		console.log('handleWheel');
		if (isNearBottom(10)) lockedToBottom = true;
		else lockedToBottom = false;
	}

	let wasDragging = false;

	function handleTouchMove(event: Event) {
		wasDragging = true;
	}

	function handleTouchEnd(event: Event) {
		if (wasDragging) {
			wasDragging = false;
			if (isNearBottom(10)) lockedToBottom = true;
			else lockedToBottom = false;
		}
	}

	function onScroll(event: Event) {
		if (isNearBottom(10)) lockedToBottom = true;

		handleScroll?.();
	}

	let lastChild: any;

	onMount(() => {
		if (!container || !content) return;

		showDebugInfo = developer.showDebugInfo();

		let lastDistanceToTop = 0;

		const findReferenceElement = async () => {
			const contentRect = content!.getBoundingClientRect();
			const containerRect = container!.getBoundingClientRect();
			const children = content!.children;

			for (let i = 0; i < children.length; i++) {
				const child = children[i] as HTMLElement;
				if (!child.dataset.messageId) continue;
				const childRect = child.getBoundingClientRect();

				if (didResize) {
					console.log('[SV] Resizing, breaking findReferenceElement');
					break;
				}

				if (childRect.bottom > containerRect.top && childRect.top < containerRect.bottom) {
					console.log('[SV] Setting new anchor element to', child.dataset.messageId);
					lastDistanceToTop = childRect.top - contentRect.top;
					anchorMessageId = child.dataset.messageId;
					if (showDebugInfo) {
						child.style.background = '#fff';
						if (lastChild === child) break;
						if (lastChild) lastChild.style.background = '#bbbb';
						lastChild = child;
					}
					break;
				}
			}
		};

		const ro = new ResizeObserver(async () => {
			if (lockedToBottom) {
				container!.scrollTop = container!.scrollHeight;
				return;
			}

			didResize = true;

			const contentRect = content!.getBoundingClientRect();
			const refEl = document.querySelector(`[data-message-id="${anchorMessageId}"]`);
			const refTop = refEl?.getBoundingClientRect().top ?? 0;
			const currentDistanceToTop = refTop - contentRect.top;

			console.log(
				`[SV] currentDistanceToTop ${currentDistanceToTop} last distance to top ${lastDistanceToTop}, messageId ${anchorMessageId}`
			);

			// If reference element moved down, content was added above
			if (currentDistanceToTop > lastDistanceToTop) {
				const offset = currentDistanceToTop - lastDistanceToTop;
				console.log('[SV] Content added above viewport, adjusting scroll:', offset);
				container!.scrollTop += offset;

				// Wait a bit before allowing findReferenceElement to run again
				setTimeout(() => {
					didResize = false;
				}, 50);
			} else {
				didResize = false;
				console.log('[SV] Content added below viewport, no adjustment needed');
			}
		});

		findReferenceElement();

		function handleScrollDebounced() {
			// Clear existing timer
			if (scrollDebounceTimer) {
				clearTimeout(scrollDebounceTimer);
			}

			// Set new timer
			scrollDebounceTimer = setTimeout(() => {
				if (didResize) {
					console.log('[SV] Resizing, not calling findReferenceElement from scroll');
					return;
				}
				console.log('[SV] Calling findReferenceElement from scroll');
				findReferenceElement();
				scrollDebounceTimer = null;
			}, 100); // 100ms debounce
		}

		container.addEventListener('scroll', handleScrollDebounced);
		ro.observe(content);

		onDestroy(() => {
			if (scrollDebounceTimer) {
				clearTimeout(scrollDebounceTimer);
			}
			ro?.disconnect();
			container?.removeEventListener('scroll', handleScrollDebounced);
		});
	});
</script>

<div
	bind:this={container}
	onscroll={onScroll}
	onwheel={handleWheel}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
	data-scroll-container
	class={` relative mini-scrollbar h-full overflow-x-hidden overflow-y-auto ${className}`}
	aria-live="polite"
>
	<div bind:this={content} class="flex flex-col">
		{@render children()}
	</div>
	{#if showDebugInfo}
		<div class="fixed top-5 right-5">
			{#if lockedToBottom}
				<p>Locked</p>
			{:else}
				<p>Unlocked</p>
			{/if}
			<p>{anchorMessageId}</p>
		</div>
	{/if}
</div>
