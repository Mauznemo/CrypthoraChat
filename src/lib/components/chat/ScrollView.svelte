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
		settled = $bindable(false),
		handleScroll,
		children
	}: {
		class?: string;
		container?: HTMLElement | null;
		/** False while the view is still settling on open, see [SETTLE_MS]. */
		settled?: boolean;
		handleScroll?: () => void;
		children: Snippet;
	} = $props();

	/** How long the view is given to find its opening position before it counts as settled. */
	const SETTLE_MS = 1000;
	/** How long after the last scroll event a user gesture stops counting as still scrolling. */
	const GESTURE_IDLE_MS = 150;

	let content: HTMLElement | null = null;
	let lockedToBottom = $state(false);
	let lastChild: any;
	let showDebugInfo = $state(false);
	let hideDownButton = $state(false);
	/** Only a scroll the user actually caused may break the bottom lock, see [onScroll]. */
	let userScrolling = false;
	let gestureIdleTimeout: NodeJS.Timeout | null = null;
	let settleTimeout: NodeJS.Timeout | null = null;

	function isNearBottom(threshold = 10): boolean {
		if (!container) return false;
		const { scrollTop, scrollHeight, clientHeight } = container;
		return scrollHeight - clientHeight - scrollTop <= threshold;
	}

	/**
	 * Pins the view to the bottom and keeps it there while the content grows.
	 *
	 * Instant by default: messages decrypt and attachments size themselves long after this is
	 * called, and an animation still running through all of that used to hand [onScroll] a stream
	 * of positions that were nowhere near the bottom. Only the scroll down button, where the
	 * movement is the point, asks for `smooth`.
	 */
	export function lockToBottom(smooth = false) {
		lockedToBottom = true;
		hideDownButton = true;
		// The click that reached the scroll down button counts as a gesture, and the scroll events
		// the pin itself produces would otherwise keep that gesture alive and unlock again.
		userScrolling = false;
		if (gestureIdleTimeout) clearTimeout(gestureIdleTimeout);
		if (!container) return;
		container.scrollTo({ top: container.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
	}

	/**
	 * A scroll the user caused, as opposed to one the browser produced from a pin or a reflow.
	 *
	 * Stays true through the whole gesture including its momentum, because every scroll event it
	 * produces pushes the idle timer back.
	 */
	function markUserScrolling() {
		userScrolling = true;
		settled = true;
		if (gestureIdleTimeout) clearTimeout(gestureIdleTimeout);
		gestureIdleTimeout = setTimeout(() => {
			userScrolling = false;
		}, GESTURE_IDLE_MS);
	}

	function onScroll() {
		handleScroll?.();

		if (userScrolling) markUserScrolling();

		if (isNearBottom(10)) {
			lockedToBottom = true;
			hideDownButton = false;
			return;
		}

		// Growing content and re-pins both scroll the container without the user asking for it.
		// Treating those as "the user scrolled away" is what used to strand the view a few
		// messages above the bottom, since the observer below then holds it there on purpose.
		if (!userScrolling) return;
		lockedToBottom = false;
		// Only ever set to suppress the button while a pin was in flight, and this scroll ended it.
		hideDownButton = false;
		// Anchor on what is on screen right now. The observer only refreshes the reference when
		// something resizes, so without this the first growth after a scroll would restore a
		// message the user has already scrolled past.
		findReference();
	}

	let lastDistanceToTop = 0;

	export function findReference() {
		if (!content || !container) return;
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

		settleTimeout = setTimeout(() => {
			settled = true;
		}, SETTLE_MS);

		const ro = new ResizeObserver(() => {
			if (!content || !container) return;

			/* 1.  bottom-lock mode → stay pinned */
			if (lockedToBottom) {
				container.scrollTop = container.scrollHeight;
				return;
			}

			/* 2.  anchored mode → restore position */
			if (layoutStore.anchorMessageId) {
				const refEl = content.querySelector<HTMLElement>(
					`[data-message-id="${layoutStore.anchorMessageId}"]`
				);
				if (refEl) {
					const newDist = refEl.offsetTop; // distance to content top
					const delta = newDist - lastDistanceToTop;
					if (delta) container.scrollTop += delta;
					if (showDebugInfo) {
						refEl.style.background = '#d18f8a';
					}
				}
			}

			/* 3.  pick a new reference for the next cycle */
			findReference();
		});

		ro.observe(content);
		// The viewport matters as much as the content: the safe area padding the wrapper sends,
		// the header switching between its online and offline shapes, and the input growing all
		// shrink the container without touching the content, and used to push the last message
		// out of sight with nothing left to notice it.
		ro.observe(container);

		for (const event of ['pointerdown', 'touchmove', 'wheel', 'keydown'] as const) {
			container.addEventListener(event, markUserScrolling, { passive: true });
		}

		onDestroy(() => {
			ro.disconnect();
			if (gestureIdleTimeout) clearTimeout(gestureIdleTimeout);
			if (settleTimeout) clearTimeout(settleTimeout);
			for (const event of ['pointerdown', 'touchmove', 'wheel', 'keydown'] as const) {
				container?.removeEventListener(event, markUserScrolling);
			}
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
			onclick={() => lockToBottom(true)}
			class="fixed z-50 cursor-pointer rounded-full bg-gray-600 p-2 text-sm font-bold text-gray-200 hover:text-white {infoBarStore.isOpen
				? 'right-[350px]'
				: 'right-10'}"
			style="bottom: {80 + layoutStore.safeAreaPadding.bottom}px;"
		>
			<Icon icon="mdi:arrow-down" class="size-6" />
		</button>
	{/if}
</div>
