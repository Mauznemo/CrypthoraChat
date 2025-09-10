<script lang="ts">
	import { decryptMessage, decryptReaction } from '$lib/crypto/message';
	import type { ClientMessage } from '$lib/types';
	import { untrack } from 'svelte';
	import Reply from './Reply.svelte';
	import { handleDecryptedMessage } from '$lib/chat/messages';
	import { processMessageText } from '$lib/chat/textTools';
	import { chatStore } from '$lib/stores/chat.svelte';
	import ProfilePicture from './ProfilePicture.svelte';

	const {
		message,
		showProfile,
		onHover,
		onTouchStart,
		onUpdateReaction,
		onDecryptError
	}: {
		message: ClientMessage;
		showProfile: boolean;
		onHover: (event: MouseEvent) => void;
		onTouchStart: (event: TouchEvent) => void;
		onUpdateReaction: (encryptedReaction: string, operation: 'add' | 'remove') => void;
		onDecryptError: (error: any, message: ClientMessage) => void;
	} = $props();

	function handleDecryptError(error: any): void {
		untrack(() => {
			onDecryptError(error, message);
		});
	}

	let reactionData = $state({});
	let lastProcessed: any = $state(null);

	$effect(() => {
		const currentKey = message.encryptedReactions;

		if (lastProcessed === currentKey) {
			return;
		}

		console.log('Effect Chat message');
		lastProcessed = currentKey;

		Promise.all(
			message.encryptedReactions.map(async (reactionKey) => {
				const [reactorId, encryptedReaction] = reactionKey.split(':');
				let decryptedReaction: string;
				try {
					decryptedReaction = await decryptReaction(encryptedReaction, message.usedKeyVersion);
				} catch (error) {
					return null;
				}
				return { reactorId, decryptedReaction, encryptedReaction };
			})
		).then((results) => {
			const validResults = results.filter((result) => result !== null);

			reactionData = validResults.reduce(
				(acc, { reactorId, decryptedReaction, encryptedReaction }) => {
					if (!acc[decryptedReaction]) {
						acc[decryptedReaction] = {
							count: 0,
							userIds: [],
							encryptedReaction: ''
						};
					}
					acc[decryptedReaction].count++;
					acc[decryptedReaction].userIds.push(reactorId);
					acc[decryptedReaction].encryptedReaction = encryptedReaction;
					return acc;
				},
				{} as Record<string, { count: number; userIds: string[]; encryptedReaction: string }>
			);
		});
	});
</script>

<div class="m-2 mr-6 flex items-start space-x-2">
	<!-- Profile picture and username (only shown for first message in group) -->
	<div
		class="absolute -top-1 -left-1 z-10 flex flex-col items-center space-y-1 lg:relative lg:top-0 lg:left-0"
	>
		{#if showProfile}
			<ProfilePicture user={message.user} size="2rem" imageSize="64" />
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
				<p class="line-clamp-1 max-w-[250px] text-sm font-medium break-all text-gray-300">
					{message.user.displayName || 'Unknown'}
				</p>
			</div>
		{/if}

		<!-- Chat message bubble -->
		<div
			class="frosted-glass-shadow relative rounded-2xl bg-gray-700/60 p-3 {message.isEdited
				? 'min-w-24 pb-5'
				: ''}"
		>
			<Reply replyToMessage={message} />

			<svelte:boundary>
				{#await decryptMessage({ message })}
					<p class="pr-9 whitespace-pre-line text-white">loading...</p>
				{:then decryptedContent}
					{handleDecryptedMessage(message, decryptedContent)}
					<p class="pr-9 whitespace-pre-line text-white">
						{@html processMessageText(decryptedContent)}
					</p>
				{:catch error}
					{handleDecryptError(error)}
					<p class="pr-9 whitespace-pre-line text-red-400">
						Failed to decrypt message {message.chat.ownerId === message.user.id
							? ' (Your Key is incorrect)'
							: ''}{message.chat.ownerId === chatStore.user?.id
							? ' (They have an incorrect key)'
							: ''}
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
		{#if message.encryptedReactions.length > 0}
			<div class="absolute -bottom-4 left-2 flex gap-1 select-none">
				{#each Object.entries(reactionData) as [reaction, data]}
					{@const typedData = data as {
						count: number;
						userIds: string[];
						encryptedReaction: string;
					}}
					{@const userReacted = typedData.userIds.includes(chatStore.user?.id || '')}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						onclick={() => {
							if (userReacted) {
								onUpdateReaction(typedData.encryptedReaction, 'remove');
							} else {
								onUpdateReaction(typedData.encryptedReaction, 'add');
							}
						}}
						title="{userReacted ? 'Remove reaction' : 'React with'} {reaction}"
						class="flex cursor-pointer items-center rounded-full px-2 py-0.5 text-sm {userReacted
							? 'bg-teal-800/90 ring-1 ring-teal-400 hover:bg-teal-900/90'
							: 'bg-gray-600/90 ring-1 ring-gray-400 hover:bg-teal-700/90'}"
					>
						<span>{reaction}</span>
						{#if typedData.count > 1}
							<span class="ml-1 text-xs text-gray-300">{typedData.count}</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
{#if message.encryptedReactions.length > 0}
	<div class="h-2"></div>
{/if}
