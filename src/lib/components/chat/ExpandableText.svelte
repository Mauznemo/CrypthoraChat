<script lang="ts">
	import { t } from 'svelte-i18n';

	/**
	 * A single message must never turn into a page of its own scrolling: past `maxHeight` the
	 * text is cut off with a fade and only unfolds when the reader asks for it.
	 */
	const {
		html,
		class: className = '',
		maxHeight = 400
	}: {
		html: string;
		class?: string;
		maxHeight?: number;
	} = $props();

	let expanded = $state(false);
	let contentEl = $state<HTMLDivElement | null>(null);
	let overflows = $state(false);

	$effect(() => {
		// Re-measure whenever the decrypted text changes, not just on mount.
		html;

		const el = contentEl;
		if (!el) return;

		// scrollHeight is the full content height even while the element is clamped, so this
		// stays correct in both states and the button does not flicker away once expanded.
		const measure = () => {
			overflows = el.scrollHeight - maxHeight > 48;
		};
		measure();

		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	});

	const collapsed = $derived(overflows && !expanded);
</script>

<div class="max-w-full">
	<div
		bind:this={contentEl}
		class="{className} {collapsed ? 'overflow-hidden' : ''}"
		style={collapsed
			? `max-height: ${maxHeight}px; mask-image: linear-gradient(to bottom, black calc(100% - 3rem), transparent); -webkit-mask-image: linear-gradient(to bottom, black calc(100% - 3rem), transparent);`
			: ''}
	>
		{@html html}
	</div>
	{#if overflows}
		<button
			type="button"
			onclick={() => (expanded = !expanded)}
			class="mt-1 cursor-pointer text-sm font-medium text-gray-200 underline underline-offset-2 hover:text-white"
		>
			{expanded ? $t('chat.show-less') : $t('chat.show-more')}
		</button>
	{/if}
</div>
