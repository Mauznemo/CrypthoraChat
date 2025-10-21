<script lang="ts">
	import { layoutStore } from '$lib/stores/layout.svelte';
	import { developer } from '$lib/utils/debug';
	import { onMount, onDestroy } from 'svelte';
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
	let lockedToBottom = $state(false);
	let lastChild: any;
	let showDebugInfo = $state(false);

	function isNearBottom(threshold = 10): boolean {
		if (!container) return false;
		const { scrollTop, scrollHeight, clientHeight } = container;
		return scrollHeight - clientHeight - scrollTop <= threshold;
	}

	export function lockToBottom() {
		lockedToBottom = true;
		container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
	}

	export function getScrollTop(): number {
		if (!container) return 0;
		return container.scrollTop;
	}

	export function setScrollTop(newTop: number) {
		if (!container) return;
		container.scrollTop = newTop;
	}

	function onScroll() {
		if (isNearBottom(10)) lockedToBottom = true;
		else lockedToBottom = false;
		handleScroll?.();
	}

	let lastDistanceToTop = 0;

	export function findReference() {
		if (!content || !container) return;
		console.log('[ScrollView] findReference');
		const children = [...content.children] as HTMLElement[];
		const contentTop = content.getBoundingClientRect().top;
		const containerTop = container.getBoundingClientRect().top;
		const containerBottom = containerTop + container.clientHeight;

		for (const child of children) {
			const id = child.dataset.messageId;
			if (!id) continue;
			const box = child.getBoundingClientRect();
			if (box.bottom > containerTop && box.top < containerBottom) {
				layoutStore.anchorMessageId = id;
				lastDistanceToTop = child.offsetTop; // store for next cycle
				if (showDebugInfo) {
					child.style.background = '#fff';
					if (lastChild !== child && lastChild) lastChild.style.background = '#bbb';
					lastChild = child;
				}
				break;
			}
		}
	}

	onMount(() => {
		showDebugInfo = developer.showDebugInfo();
		if (!container || !content) return;

		// findReference();

		const ro = new ResizeObserver(() => {
			if (!content || !container) return;
			console.log('[ScrollView] resize detected');

			/* 1.  anchored mode → restore position */
			if (!lockedToBottom && layoutStore.anchorMessageId) {
				const refEl = content.querySelector<HTMLElement>(
					`[data-message-id="${layoutStore.anchorMessageId}"]`
				);
				console.log('[ScrollView] restoring position for:', layoutStore.anchorMessageId);
				if (refEl) {
					const newDist = refEl.offsetTop; // distance to content top
					const delta = newDist - lastDistanceToTop;
					if (delta) container.scrollTop += delta;
					console.log('[ScrollView] restored position');
					if (showDebugInfo) {
						refEl.style.background = '#d18f8a';
					}
				}
			}

			/* 2.  bottom-lock mode → stay pinned */
			if (lockedToBottom) {
				container.scrollTop = container.scrollHeight;
				console.log('[ScrollView] locked to bottom');
			}

			/* 3.  pick a new reference for the next cycle */
			findReference();
		});

		ro.observe(content);

		onDestroy(() => {
			ro.disconnect();
		});
	});
</script>

<div
	bind:this={container}
	onscroll={onScroll}
	class={`relative container mini-scrollbar h-full overflow-x-hidden overflow-y-auto ${className}`}
	aria-live="polite"
>
	<div bind:this={content} class="flex flex-col">
		{@render children()}
	</div>
	{#if showDebugInfo}
		<div class="fixed top-5 right-5 text-xs">
			{lockedToBottom ? 'Locked' : 'Unlocked'} | {layoutStore.anchorMessageId}
		</div>
	{/if}
</div>
