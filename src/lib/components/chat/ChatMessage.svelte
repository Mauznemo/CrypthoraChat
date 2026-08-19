<script lang="ts">
	import { decryptMessage, decryptReaction, encryptReaction } from '$lib/crypto/message';
	import type { ClientMessage } from '$lib/types';
	import { untrack } from 'svelte';
	import Reply from './Reply.svelte';
	import { processMessageText } from '$lib/chat/textTools';
	import { chatStore } from '$lib/stores/chat.svelte';
	import ProfilePicture from './ProfilePicture.svelte';
	import MessageAttachments from './MessageAttachments.svelte';
	import ExpandableText from './ExpandableText.svelte';
	import { t } from 'svelte-i18n';
	import { formatDate } from '$lib/chat/messages';

	const {
		message,
		showProfile,
		onHover,
		onUpdateReaction,
		onDecryptError
	}: {
		message: ClientMessage;
		showProfile: boolean;
		onHover: (event: MouseEvent) => void;
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
							myEncryptedReaction: ''
						};
					}
					acc[decryptedReaction].count++;
					acc[decryptedReaction].userIds.push(reactorId);
					// Only our own ciphertext is worth keeping: it is the one the server has to be
					// given back verbatim to remove this reaction again.
					if (reactorId === chatStore.user?.id) {
						acc[decryptedReaction].myEncryptedReaction = encryptedReaction;
					}
					return acc;
				},
				{} as Record<string, { count: number; userIds: string[]; myEncryptedReaction: string }>
			);
		});
	});
</script>

{#if showProfile}
	<div class="h-2"></div>
{/if}
<div class="relative m-1 mr-6 flex items-start space-x-2 lg:pl-10">
	<!-- Profile picture and username (only shown for first message in group) -->
	<div class="absolute -top-1 -left-1 z-10 flex flex-col items-center space-y-1 lg:top-0 lg:left-0">
		{#if showProfile}
			<ProfilePicture user={message.user} size="2rem" imageSize="64" />
		{:else}
			<!-- Spacer to maintain alignment -->
			<div class="flex h-8 w-8"></div>
		{/if}
	</div>

	<!-- Chat message container -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div onmouseenter={onHover} class="message-bubble relative flex max-w-full flex-col items-start lg:max-w-[70%]">
		<!-- Username (only shown for first message in group and not for own messages) -->
		{#if showProfile}
			<div class="mb-0.5 pl-9 lg:pl-1.5">
				<p class="line-clamp-1 max-w-[250px] text-sm font-medium break-all text-gray-300">
					{message.user.displayName || 'Unknown'}
				</p>
			</div>
		{/if}

		<!-- Chat message bubble -->
		<div
			class="relative max-w-full rounded-2xl bg-gray-700/60 p-3 frosted-glass-shadow {message.isEdited
				? 'min-w-24 pb-5'
				: ''}"
		>
			<Reply replyToMessage={message} />

			{#if message.attachmentPaths.length > 0}
				<MessageAttachments
					attachmentPaths={message.attachmentPaths}
					keyVersion={message.usedKeyVersion}
				/>
			{/if}

			<svelte:boundary>
				{#await decryptMessage({ message })}
					{#if message.attachmentPaths.length === 0}
						<p class="pr-9 whitespace-pre-line text-white">{$t('common.loading')}</p>
					{/if}
				{:then decryptedContent}
					<ExpandableText
						html={processMessageText(decryptedContent)}
						class="pr-9 break-words whitespace-pre-line text-white"
					/>
				{:catch error}
					{handleDecryptError(error)}
					<p class="pr-9 whitespace-pre-line text-red-400">
						{#if message.chat.ownerId === message.user.id}
							{$t('chat.decryption-error.own-key-incorrect')}
						{:else if message.chat.ownerId === chatStore.user?.id}
							{$t('chat.decryption-error.their-key-incorrect')}
						{:else}
							{$t('chat.decryption-error.base')}
						{/if}
					</p>
					<p class="pr-9 text-sm whitespace-pre-line text-red-400/50">{error}</p>
				{/await}
			</svelte:boundary>

			<div class="absolute right-2 bottom-1 text-xs text-gray-300 opacity-70">
				{formatDate(message.timestamp)}{message.isEdited ? ` ${$t('chat.edited')}` : ''}
			</div>
		</div>
		{#if message.encryptedReactions.length > 0}
			<div class="absolute -bottom-5 left-2 flex gap-1 select-none">
				{#each Object.entries(reactionData) as [reaction, data]}
					{@const typedData = data as {
						count: number;
						userIds: string[];
						myEncryptedReaction: string;
					}}
					{@const userReacted = typedData.userIds.includes(chatStore.user?.id || '')}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						onclick={async () => {
							// Remove has to name the exact stored blob, and adding needs a fresh one -
							// reusing another reactor's ciphertext left removal matching nothing.
							if (userReacted) {
								if (typedData.myEncryptedReaction) {
									onUpdateReaction(typedData.myEncryptedReaction, 'remove');
								}
							} else {
								onUpdateReaction(await encryptReaction(reaction, message.usedKeyVersion), 'add');
							}
						}}
						data-tooltip={userReacted
							? $t('chat.remove-reaction')
							: $t('chat.react-with', { values: { reaction } })}
						class="flex cursor-pointer items-center rounded-full px-2 py-0.5 text-[16px] {userReacted
							? 'bg-accent-800/90 ring-1 ring-accent-400 hover:bg-accent-900/90'
							: 'bg-gray-600/90 ring-1 ring-gray-400 hover:bg-accent-700/90'}"
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
	<div class="h-4"></div>
{/if}
