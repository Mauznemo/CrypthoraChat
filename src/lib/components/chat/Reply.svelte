<script lang="ts">
	import { processLinks } from '$lib/linkUtils';
	import { decryptMessage } from '$lib/messageCrypto';
	import type { MessageWithRelations } from '$lib/types';

	const {
		replyToMessage
	}: {
		replyToMessage: MessageWithRelations | null;
	} = $props();
</script>

{#if replyToMessage?.replyTo}
	<div class="mb-1 rounded-sm border-l-2 border-white/50 bg-gray-500/50 pr-1 pb-0.5 pl-2">
		<svelte:boundary>
			<p class="line-clamp-4 max-w-[40ch] text-sm break-words whitespace-pre-line text-gray-100">
				{@html processLinks(await decryptMessage(replyToMessage.replyTo.encryptedContent))}
			</p>
			{#snippet pending()}
				<p class="whitespace-pre-line text-white">loading...</p>
			{/snippet}
		</svelte:boundary>
	</div>
{/if}
