<script lang="ts">
	import { processMessageText } from '$lib/chat/textTools';
	import { decryptMessage } from '$lib/crypto/message';
	import type { ClientMessage } from '$lib/types';
	import Icon from '@iconify/svelte';

	const {
		replyToMessage
	}: {
		replyToMessage: ClientMessage | null;
	} = $props();
</script>

{#if replyToMessage?.replyTo}
	<div class="mb-1 rounded-sm border-l-2 border-white/50 bg-gray-500/50 pr-1 pb-0.5 pl-2">
		<svelte:boundary>
			{#await decryptMessage({ message: replyToMessage.replyTo as ClientMessage })}
				<p class="line-clamp-4 max-w-[40ch] text-sm break-words whitespace-pre-line text-gray-100">
					loading...
				</p>
			{:then decryptedContent}
				{#if decryptedContent === ''}
					<Icon icon="mdi:attach-file" class="size-5 pt-0.5 text-gray-100" />
				{:else}
					<p
						class="line-clamp-4 max-w-[40ch] text-sm break-words whitespace-pre-line text-gray-100"
					>
						{@html processMessageText(decryptedContent)}
					</p>
				{/if}
			{:catch error}
				<p class="pr-9 whitespace-pre-line text-red-300">Failed to load message {error}</p>
			{/await}
		</svelte:boundary>
	</div>
{/if}
