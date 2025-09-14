<script lang="ts">
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
	let anchorMessageId: string = '';

	export function scrollToBottomImmediate(): void {
		container?.scrollTo({
			top: container.scrollHeight,
			behavior: 'smooth'
		});
	}

	export function scrollToBottom(delay = 100): void {
		setTimeout(() => {
			container?.scrollTo({
				top: container.scrollHeight,
				behavior: 'smooth'
			});
		}, delay);
	}

	onMount(() => {
		if (!container || !content) return;

		let lastDistanceToTop = 0;

		const findReferenceElement = async () => {
			// await tick();

			const contentRect = content!.getBoundingClientRect();
			const containerRect = container!.getBoundingClientRect();
			const children = content!.children;

			for (let i = 0; i < children.length; i++) {
				const child = children[i] as HTMLElement;
				if (!child.dataset.messageId) continue;
				const childRect = child.getBoundingClientRect();

				if (childRect.bottom > containerRect.top && childRect.top < containerRect.bottom) {
					lastDistanceToTop = childRect.top - contentRect.top;
					anchorMessageId = child.dataset.messageId;
					break;
				}
			}
		};

		const ro = new ResizeObserver(() => {
			const contentRect = content!.getBoundingClientRect();
			const refEl = document.querySelector(`[data-message-id="${anchorMessageId}"]`);
			const refTop = refEl?.getBoundingClientRect().top ?? 0;
			const currentDistanceToTop = refTop - contentRect.top;

			console.log(
				`[SV] currentDistanceToTop ${currentDistanceToTop} last distance to top ${lastDistanceToTop}`
			);

			// If reference element moved down, content was added above
			if (currentDistanceToTop > lastDistanceToTop) {
				const offset = currentDistanceToTop - lastDistanceToTop;
				console.log('[SV] Content added above viewport, adjusting scroll:', offset);
				container!.scrollTop += offset;
			} else {
				console.log('[SV] Content added below viewport, no adjustment needed');
			}
		});

		findReferenceElement();

		function handleScroll() {
			findReferenceElement();
		}

		container.addEventListener('scroll', handleScroll);
		ro.observe(content);

		onDestroy(() => {
			ro?.disconnect();
			container?.removeEventListener('scroll', handleScroll);
		});
	});
</script>

<div
	bind:this={container}
	onscroll={handleScroll}
	data-scroll-container
	class={` relative mini-scrollbar h-full w-full overflow-y-auto ${className}`}
	aria-live="polite"
>
	<div bind:this={content} class="flex flex-col">
		{@render children()}
	</div>
</div>
