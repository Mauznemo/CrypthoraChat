<script lang="ts">
	import { processLinks } from '$lib/linkUtils';
	import { decryptMessage } from '$lib/crypto/message';
	import type { MessageWithRelations } from '$lib/types';

	const {
		chatKey,
		replyToMessage
	}: {
		chatKey: CryptoKey;
		replyToMessage: MessageWithRelations | null;
	} = $props();
</script>

{#if replyToMessage?.replyTo}
	<div class="mb-1 rounded-sm border-l-2 border-white/50 bg-gray-500/50 pr-1 pb-0.5 pl-2">
		<svelte:boundary>
			{#await decryptMessage(replyToMessage.replyTo.encryptedContent, chatKey)}
				<p class="line-clamp-4 max-w-[40ch] text-sm break-words whitespace-pre-line text-gray-100">
					loading...
				</p>
			{:then decryptedContent}
				<p class="line-clamp-4 max-w-[40ch] text-sm break-words whitespace-pre-line text-gray-100">
					{@html processLinks(decryptedContent)}
				</p>
			{:catch error}
				<p class="pr-9 whitespace-pre-line text-red-300">Failed to load message</p>
			{/await}
		</svelte:boundary>
	</div>
{/if}
