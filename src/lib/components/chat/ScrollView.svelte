<script lang="ts">
	import { infoBarStore } from '$lib/stores/infoBar.svelte';
	import { layoutStore } from '$lib/stores/layout.svelte';
	import { developer } from '$lib/utils/debug';
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
	/** Whether there is anything to scroll at all - a short chat has no down button to offer */
	let isScrollable = $state(false);

	function isNearBottom(threshold = 10): boolean {
		if (!container) return false;
		const { scrollTop, scrollHeight, clientHeight } = container;
		return scrollHeight - clientHeight - scrollTop <= threshold;
	}

	/**
	 * Recomputes the button's preconditions from the container itself, for the cases where no
	 * scroll event ever fires: a chat too short to overflow, or a restored position that is
	 * already at the bottom. Both used to leave `lockedToBottom` stuck at its initial false and
	 * showed a button that had nowhere to scroll to.
	 *
	 * Only ever locks, never unlocks - unlocking stays with `onScroll` and its `allowUnlock`
	 * guard, so the grace period after a smooth scroll is untouched.
	 */
	function syncScrollState(): void {
		if (!container) return;
		isScrollable = container.scrollHeight - container.clientHeight > 10;

		if (!isScrollable || isNearBottom(10)) {
			lockedToBottom = true;
			hideDownButton = false;
		}
	}

	export function lockToBottom() {
		lockedToBottom = true;
		hideDownButton = true;
		allowUnlock = false;
		if (unlockTimeout) clearTimeout(unlockTimeout);
		unlockTimeout = setTimeout(() => {
			allowUnlock = true;
		}, 500);
		container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
	}

	function onScroll() {
		handleScroll?.();
		syncScrollState();

		if (!isNearBottom(10)) {
			if (!allowUnlock) return;
			lockedToBottom = false;
		}
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

		const ro = new ResizeObserver(() => {
			if (!content || !container) return;

			/* 1.  anchored mode → restore position */
			if (!lockedToBottom && layoutStore.anchorMessageId) {
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

			/* 2.  bottom-lock mode → stay pinned */
			if (lockedToBottom) {
				container.scrollTop = container.scrollHeight;
			}

			/* 3.  pick a new reference for the next cycle */
			findReference();

			/* 4.  the content or the viewport just changed size, so whether the down button has
			       anywhere to scroll to may have changed with it. Fires once on observe too,
			       which is what covers the initial render. */
			syncScrollState();
		});

		ro.observe(content);
		// The viewport matters as much as the content: the safe area padding the wrapper sends,
		// the header switching between its online and offline shapes, and the input growing all
		// shrink the container without touching the content, and used to push the last message
		// out of sight with nothing left to notice it.
		ro.observe(container);
		// The observer covers every later change, but its first delivery is up to the browser and
		// is withheld entirely while the tab is hidden. Seed the state directly so a view that is
		// built off screen still starts out consistent.
		syncScrollState();

		onDestroy(() => {
			ro.disconnect();
			if (unlockTimeout) clearTimeout(unlockTimeout);
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
	{#if isScrollable && !lockedToBottom && !hideDownButton}
		<button
			transition:fly|global={{ duration: 500, y: 200 }}
			onclick={lockToBottom}
			class="fixed z-50 cursor-pointer rounded-full bg-gray-600 p-2 text-sm font-bold text-gray-200 hover:text-white {infoBarStore.isOpen
				? 'right-[350px]'
				: 'right-10'}"
			style="bottom: {80 + layoutStore.safeAreaPadding.bottom}px;"
		>
			<IconMdiArrowDown class="size-6" />
		</button>
	{/if}
</div>
