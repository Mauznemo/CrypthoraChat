<script lang="ts">
	import { decryptMessage } from '$lib/crypto/message';
	import { processLinks } from '$lib/linkUtils';
	import type { ClientMessage } from '$lib/types';
	import { untrack } from 'svelte';
	import Reply from './Reply.svelte';
	import { handleMessageUpdated } from '$lib/chat/messages';

	const {
		message,
		chatKey,
		showProfile,
		userId,
		onHover,
		onTouchStart,
		onUpdateReaction,
		onDecryptError
	}: {
		message: ClientMessage;
		chatKey: CryptoKey;
		showProfile: boolean;
		userId: string;
		onHover: (event: MouseEvent) => void;
		onTouchStart: (event: TouchEvent) => void;
		onUpdateReaction: (emoji: string, operation: 'add' | 'remove') => void;
		onDecryptError: (error: any, message: ClientMessage) => void;
	} = $props();

	function handleDecryptedMessage(message: ClientMessage, decryptedContent: string): void {
		untrack(() => {
			message.decryptedContent = decryptedContent;
			handleMessageUpdated(message, { triggerRerender: false });
		});
	}

	function handleDecryptError(error: any): void {
		untrack(() => {
			onDecryptError(error, message);
		});
	}
</script>

<div class="m-2 mr-6 flex items-start space-x-2">
	<!-- Profile picture and username (only shown for first message in group) -->
	<div
		class="absolute -top-1 -left-1 z-10 flex flex-col items-center space-y-1 lg:relative lg:top-0 lg:left-0"
	>
		{#if showProfile}
			<div
				class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-500 text-white shadow-xl"
			>
				<p>{message.user.username?.charAt(0).toUpperCase() || 'P'}</p>
			</div>
		{:else}
			<!-- Spacer to maintain alignment -->
			<div class="flex h-8 w-8"></div>
		{/if}
	</div>

	<!-- Chat message container -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		onmouseenter={onHover}
		ontouchstart={onTouchStart}
		class="message-bubble relative flex flex-col items-start"
	>
		<!-- Username (only shown for first message in group and not for own messages) -->
		{#if showProfile}
			<div class="mb-0.5 pl-7 lg:pl-1.5">
				<p class="text-sm font-medium text-gray-300">{message.user.username || 'Unknown'}</p>
			</div>
		{/if}

		<!-- Chat message bubble -->
		<div
			class="frosted-glass-shadow relative rounded-2xl bg-gray-700/60 p-3 {message.isEdited
				? 'min-w-24 pb-5'
				: ''}"
		>
			<Reply {chatKey} replyToMessage={message} />

			<svelte:boundary>
				{#await decryptMessage({ message, chatKey })}
					<p class="pr-9 whitespace-pre-line text-white">loading...</p>
				{:then decryptedContent}
					{handleDecryptedMessage(message, decryptedContent)}
					<p class="pr-9 whitespace-pre-line text-white">
						{@html processLinks(decryptedContent)}
					</p>
				{:catch error}
					{handleDecryptError(error)}
					<p class="pr-9 whitespace-pre-line text-red-400">
						Failed to decrypt message {message.chat.ownerId === message.user.id
							? ' (Your Key is incorrect)'
							: ''}{message.chat.ownerId === userId ? ' (They have an incorrect key)' : ''}
					</p>
					<p class="pr-9 text-sm whitespace-pre-line text-red-400/50">{error}</p>
				{/await}
			</svelte:boundary>
			<!-- Timestamp -->
			<div class="absolute right-2 bottom-1 text-xs text-gray-300 opacity-70">
				{new Date(message.timestamp).toLocaleTimeString([], {
					hour: '2-digit',
					minute: '2-digit'
				})}{message.isEdited ? ' edited' : ''}
			</div>
		</div>
		{#if message.reactions.length > 0}
			{@const emojiData = message.reactions.reduce(
				(acc, reaction) => {
					const [reactorId, emoji] = reaction.split(':');
					if (!acc[emoji]) {
						acc[emoji] = { count: 0, userIds: [] };
					}
					acc[emoji].count++;
					acc[emoji].userIds.push(reactorId);
					return acc;
				},
				{} as Record<string, { count: number; userIds: string[] }>
			)}

			<div class="absolute -bottom-4 left-2 flex gap-1">
				{#each Object.entries(emojiData) as [emoji, data]}
					{@const userReacted = data.userIds.includes(userId)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						onclick={() => {
							if (userReacted) {
								onUpdateReaction(emoji, 'remove');
							} else {
								onUpdateReaction(emoji, 'add');
							}
						}}
						title="React with {emoji}"
						class="flex cursor-pointer items-center rounded-full px-2 py-0.5 text-sm {userReacted
							? 'bg-teal-800/90 ring-1 ring-teal-400 hover:bg-teal-900/90'
							: 'bg-gray-600/90 ring-1 ring-gray-400 hover:bg-teal-700/90'}"
					>
						<span>{emoji}</span>
						{#if data.count > 1}
							<span class="ml-1 text-xs text-gray-300">{data.count}</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
{#if message.reactions.length > 0}
	<div class="h-2"></div>
{/if}
