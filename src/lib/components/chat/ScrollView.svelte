<script lang="ts">
	import { infoBarStore } from '$lib/stores/infoBar.svelte';
	import { layoutStore } from '$lib/stores/layout.svelte';
	import { developer } from '$lib/utils/debug';
	import Icon from '@iconify/svelte';
	import { onMount, onDestroy } from 'svelte';
	import type { Snippet } from 'svelte';
	import { fly } from 'svelte/transition';

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
	let hideDownButton = $state(false);
	let allowUnlock = $state(false);
	let unlockTimeout: NodeJS.Timeout | null = null;

	function isNearBottom(threshold = 10): boolean {
		if (!container) return false;
		const { scrollTop, scrollHeight, clientHeight } = container;
		return scrollHeight - clientHeight - scrollTop <= threshold;
	}

	export function lockToBottom() {
		lockedToBottom = true;
		hideDownButton = true;
		allowUnlock = false;
		unlockTimeout = setTimeout(() => {
			allowUnlock = true;
		}, 500);
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
		handleScroll?.();

		if (isNearBottom(10)) {
			lockedToBottom = true;
			hideDownButton = false;
		} else {
			if (!allowUnlock) return;
			lockedToBottom = false;
		}
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
	class={`relative mini-scrollbar h-full overflow-x-hidden overflow-y-auto ${className}`}
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
	{#if !lockedToBottom && !hideDownButton}
		<button
			transition:fly|global={{ duration: 500, y: 200 }}
			onclick={lockToBottom}
			class="fixed z-50 cursor-pointer rounded-full bg-gray-600 p-2 text-sm font-bold text-gray-200 hover:text-white {infoBarStore.isOpen
				? 'right-[350px]'
				: 'right-10'}"
			style="bottom: {80 + layoutStore.safeAreaPadding.bottom}px;"
		>
			<Icon icon="mdi:arrow-down" class="size-6" />
		</button>
	{/if}
</div>
