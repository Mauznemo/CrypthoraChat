<script lang="ts">
	import { decryptMessage } from '$lib/crypto/message';
	import { processLinks } from '$lib/linkUtils';
	import type { ClientMessage, SafeUser } from '$lib/types';
	import { untrack } from 'svelte';
	import Reply from './Reply.svelte';
	import { handleMessageUpdated } from '$lib/chat/messageHandlers';

	function clamp(value: number, min: number, max: number): number {
		return Math.max(min, Math.min(max, value));
	}

	const {
		message,
		chatKey,
		userId,
		showProfile,
		isLast,
		onHover,
		onTouchStart,
		onUpdateReaction
	}: {
		message: ClientMessage;
		chatKey: CryptoKey;
		userId: string;
		showProfile: boolean;
		isLast: boolean;
		onHover: (event: MouseEvent) => void;
		onTouchStart: (event: TouchEvent) => void;
		onUpdateReaction: (emoji: string, operation: 'add' | 'remove') => void;
	} = $props();

	let readers = $state<SafeUser[]>([]);

	$effect(() => {
		readers = message.readBy.filter((reader: SafeUser) => reader.id !== userId);
	});

	function handleDecryptedMessage(message: ClientMessage, decryptedContent: string): void {
		untrack(() => {
			message.decryptedContent = decryptedContent;
			handleMessageUpdated(message, { triggerRerender: false });
		});
	}
</script>

<div class="m-2 ml-6 flex flex-row-reverse items-start space-x-2 space-x-reverse">
	<!-- Profile picture and username (only shown for first message in group) -->
	<div
		class="absolute -top-5 -right-1 z-10 flex flex-col items-center space-y-1 lg:relative lg:top-0 lg:right-0"
	>
		{#if showProfile}
			<div
				class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-500 text-white shadow-xl"
			>
				<p>{message.user.username.charAt(0).toUpperCase() || 'P'}</p>
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
		class="message-bubble relative flex flex-col items-end"
	>
		<!-- Chat message bubble -->
		<div
			class="frosted-glass-shadow relative rounded-2xl bg-teal-700/60 p-3 {message.isEdited
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
					<p class="pr-9 whitespace-pre-line text-red-400">Failed to decrypt message</p>
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
			{@const offset = isLast ? clamp(readers.length - 1, 0, 4) : 0}
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

			<div
				class="absolute -bottom-4 flex gap-1"
				style="right: {offset * 12 + (isLast ? 36 : 8)}px;"
			>
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

		<!-- Read receipt avatars or checkmark (only for last message sent by me) -->
		{#if isLast}
			{@const shownReaders = readers.slice(0, 3)}
			<div class="absolute right-2 -bottom-3 z-10 flex">
				{#if readers && readers.length > 0}
					{#each shownReaders as reader, readIndex}
						<div
							class="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-blue-500 text-xs font-medium text-white shadow-lg"
							style="margin-left: {readIndex > 0 ? '-8px' : '0'}"
						>
							{reader.username.charAt(0).toUpperCase()}
						</div>
					{/each}
					{#if readers.length > 3}
						<div
							class="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-gray-600 text-xs font-medium text-white shadow-lg"
							style="margin-left: -8px"
						>
							+{readers.length - 3}
						</div>
					{/if}
				{:else}
					<!-- Single checkmark when no one has read the message yet -->
					<div
						class="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-gray-500 text-white shadow-lg"
					>
						<svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
							<path
								fill-rule="evenodd"
								d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
{#if message.reactions.length > 0}
	<div class="h-2"></div>
{/if}
