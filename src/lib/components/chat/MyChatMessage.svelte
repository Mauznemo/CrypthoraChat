<script lang="ts">
	import { decryptMessage, decryptReaction } from '$lib/crypto/message';
	import type { ClientMessage, SafeUser } from '$lib/types';
	import Reply from './Reply.svelte';
	import { processMessageText } from '$lib/chat/textTools';
	import { chatStore } from '$lib/stores/chat.svelte';
	import ProfilePicture from './ProfilePicture.svelte';
	import Attachment from './Attachment.svelte';
	import Icon from '@iconify/svelte';
	import { t } from 'svelte-i18n';
	import { formatDate } from '$lib/chat/messages';

	function clamp(value: number, min: number, max: number): number {
		return Math.max(min, Math.min(max, value));
	}

	const {
		message,
		showProfile,
		isLast,
		onHover,
		onUpdateReaction
	}: {
		message: ClientMessage;
		showProfile: boolean;
		isLast: boolean;
		onHover: (event: MouseEvent) => void;
		onUpdateReaction: (emoji: string, operation: 'add' | 'remove') => void;
	} = $props();

	let readers = $state<SafeUser[]>([]);

	let reactionData = $state({});
	let lastProcessed: any = $state(null);

	$effect(() => {
		readers = message.readBy.filter((reader: SafeUser) => reader.id !== chatStore.user?.id);

		const currentKey = message.encryptedReactions;

		if (lastProcessed === currentKey) {
			return;
		}

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

{#if showProfile}
	<div class="h-5 lg:hidden"></div>
{/if}
<div
	class="message-container relative my-1 flex flex-row-reverse items-start space-x-2 space-x-reverse"
>
	<!-- Profile picture and username (only shown for first message in group) -->
	<div
		class="absolute -top-[20px] -right-1 z-10 flex flex-col items-center space-y-1 lg:relative lg:top-0 lg:right-0"
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
	<div onmouseenter={onHover} class="message-bubble relative flex max-w-full flex-col items-end">
		<!-- Chat message bubble -->
		<div
			class="relative max-w-full rounded-2xl bg-accent-700/60 p-3 frosted-glass-shadow {message.isEdited
				? 'min-w-24 pb-5'
				: ''}"
		>
			<Reply replyToMessage={message} />

			{#if message.attachmentPaths.length > 0}
				<p class="text-sm text-gray-400">
					{$t('chat.attachments', { values: { count: message.attachmentPaths.length } })}
				</p>
				<div class="mt-2 flex max-w-full flex-col items-end">
					{#each message.attachmentPaths as attachmentPath}
						<Attachment {attachmentPath} keyVersion={message.usedKeyVersion} />
					{/each}
				</div>
			{/if}

			<svelte:boundary>
				{#await decryptMessage({ message })}
					{#if message.attachmentPaths.length === 0}
						<p class="pr-9 whitespace-pre-line text-white">{$t('common.loading')}</p>
					{/if}
				{:then decryptedContent}
					<p class="pr-9 break-all whitespace-pre-line text-white">
						{@html processMessageText(decryptedContent)}
					</p>
				{:catch error}
					<p class="pr-9 whitespace-pre-line text-red-400">
						{$t('chat.failed-to-decrypt-message')}
					</p>
					<p class="pr-9 text-sm whitespace-pre-line text-red-400/50">{error}</p>
				{/await}
			</svelte:boundary>

			<div class="absolute right-2 bottom-1 text-xs text-gray-300 opacity-70">
				{formatDate(message.timestamp)}{message.isEdited ? ` ${$t('chat.edited')}` : ''}
			</div>
		</div>

		{#if message.encryptedReactions.length > 0}
			{@const offset = isLast ? clamp(readers.length - 1, 0, 4) : 0}

			<div
				class="absolute -bottom-5 flex gap-1 select-none"
				style="right: {offset * 12 + (isLast ? 36 : 8)}px;"
			>
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

		<!-- Read receipt avatars or checkmark (only for last message sent by me) -->
		{#if isLast}
			{@const shownReaders = readers.slice(0, 3)}
			<div class="absolute right-2 -bottom-3 z-10 flex">
				{#if readers && readers.length > 0}
					{#each shownReaders as reader, readIndex}
						<!-- <div
							class="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-blue-500 text-xs font-medium text-white shadow-lg"
							style="margin-left: {readIndex > 0 ? '-8px' : '0'}"
						>
							{reader.username.charAt(0).toUpperCase()}
						</div> -->
						<ProfilePicture
							class="border-2 border-white font-medium shadow-lg"
							user={reader}
							background="bg-blue-500"
							style="margin-left: {readIndex > 0 ? '-8px' : '0'};"
							size="20px"
							imageSize="32"
						/>
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
						<Icon icon="mdi:check-bold" class="size-3" />
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
{#if message.encryptedReactions.length > 0}
	<div class="h-4"></div>
{/if}
