<script lang="ts">
	import { t } from 'svelte-i18n';
	import Attachment from './Attachment.svelte';

	const {
		attachmentPaths,
		keyVersion
	}: {
		attachmentPaths: string[];
		keyVersion: number;
	} = $props();

	/**
	 * Only the first few are mounted: the hidden ones are not just visually collapsed, they also
	 * skip their download and decrypt work until someone actually asks to see them.
	 */
	const PREVIEW_LIMIT = 4;

	let expanded = $state(false);

	const hiddenCount = $derived(Math.max(0, attachmentPaths.length - PREVIEW_LIMIT));
	const shownPaths = $derived(expanded ? attachmentPaths : attachmentPaths.slice(0, PREVIEW_LIMIT));
</script>

<p class="text-sm text-gray-400">
	{$t('chat.attachments', { values: { count: attachmentPaths.length } })}
</p>
<div class="mt-2 flex max-w-full flex-col items-end">
	{#each shownPaths as attachmentPath}
		<Attachment {attachmentPath} {keyVersion} />
	{/each}
	{#if hiddenCount > 0}
		<!-- mb-4 keeps the button clear of the timestamp the bubble pins to its bottom right. -->
		<button
			type="button"
			onclick={() => (expanded = !expanded)}
			class="mt-1 mb-4 cursor-pointer text-sm font-medium text-gray-200 underline underline-offset-2 hover:text-white"
		>
			{expanded
				? $t('chat.show-less')
				: $t('chat.show-more-attachments', { values: { count: hiddenCount } })}
		</button>
	{/if}
</div>
