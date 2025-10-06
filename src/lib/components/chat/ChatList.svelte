<script lang="ts">
	import { onMount } from 'svelte';
	import { getUserChats, leaveChat } from '$lib/chat/chat.remote';
	import type { ClientChat } from '$lib/types';
	import LoadingSpinner from '../LoadingSpinner.svelte';
	import { socketStore } from '$lib/stores/socket.svelte';
	import { contextMenuStore, type ContextMenuItem } from '$lib/stores/contextMenu.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { addUserToChatStore } from '$lib/stores/addUserToChat.svelte';
	import { chats } from '$lib/chat/chats';
	import { chatList } from '$lib/chat/chatList';
	import { chatOwner } from '$lib/chat/chatOwner';
	import ProfilePicture from './ProfilePicture.svelte';
	import GroupPicture from './GroupPicture.svelte';
	import { deleteFilesNotContaining, deleteFilesThatContain } from '$lib/idb';
	import Icon from '@iconify/svelte';
	import { t } from 'svelte-i18n';
	import { infoBarStore } from '$lib/stores/infoBar.svelte';

	let {
		onChatSelected,
		onCreateChat
	}: {
		onChatSelected: (chatId: string) => void;
		onCreateChat: () => void;
	} = $props();

	let loadingChats = $state(true);

	async function _leaveChat(chat: ClientChat): Promise<void> {
		try {
			await leaveChat(chat.id);
			await deleteFilesThatContain(chat.id);
			chats.tryDeselectChat(chat);
			chatList.removeChat(chat.id);
		} catch (error) {
			modalStore.error(error, $t('chat.chat-list.leave-failed'));
		}
	}

	async function handleShowContextMenu(event: Event, chat: ClientChat): Promise<void> {
		console.log('showContextMenu');
		event.stopPropagation();
		event.preventDefault();

		const items: ContextMenuItem[] = [];
		const isChatOwner = chat.ownerId === chatStore.user?.id;

		if (isChatOwner) {
			items.push({
				id: 'rotate-key',
				label: $t('chat.chat-list.rotate-key'),
				icon: 'mdi:rotate-clockwise',
				action: async () => {
					modalStore.confirm($t('common.are-you-sure'), $t('chat.chat-list.rotate-key-confirm'), {
						onConfirm: () => {
							chatOwner.tryRotateChatKey(chat);
						}
					});
				}
			});

			if (chat.type === 'group') {
				items.push({
					id: 'add-user',
					label: $t('chat.chat-list.add-user'),
					icon: 'mdi:account-multiple-add-outline',
					action: () => {
						addUserToChatStore.open(chat);
					}
				});
			}
		}

		if (chat.type === 'group') {
			items.push({
				id: 'edit',
				label: $t('chat.chat-list.edit-group'),
				icon: 'mdi:edit-outline',
				action: () => {
					infoBarStore.openChatInfo();
				}
			});
		}

		items.push({
			id: 'leave',
			label:
				chat.type === 'group' ? $t('chat.chat-list.leave-group') : $t('chat.chat-list.delete-chat'),
			icon: 'mdi:account-arrow-left-outline',
			action: async () => {
				if (chat.type === 'dm') {
					modalStore.confirm($t('common.are-you-sure'), $t('chat.chat-list.leave-dm-confirm'), {
						onConfirm: () => {
							_leaveChat(chat);
						}
					});
				} else {
					_leaveChat(chat);
				}
			}
		});

		contextMenuStore.open(event.target as HTMLElement, items);
	}

	onMount(async () => {
		loadingChats = true;
		chatStore.chats = await getUserChats();
		loadingChats = false;
		const currentChatIds = chatStore.chats.map((c) => c.id);
		await deleteFilesNotContaining(currentChatIds);
	});
</script>

<div class="mt-5">
	<p class="px-2 text-sm font-semibold text-gray-300">{$t('chat.chat-list.chats')}</p>

	{#if loadingChats}
		<div class="flex h-full items-center justify-center p-10">
			<LoadingSpinner />
		</div>
	{/if}
	{#each chatStore.chats as chat, index}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			onclick={() => {
				onChatSelected(chat.id);
			}}
			role="button"
			tabindex="0"
			class="relative flex h-15 w-full cursor-pointer items-center justify-start px-3 transition-colors {chatStore
				.activeChat?.id === chat.id
				? 'bg-accent-700/30'
				: 'hover:bg-gray-700/40 '}"
		>
			{#if chat.type === 'dm'}
				{@const otherUser = chat.participants.find((p) => p.user.id !== chatStore.user?.id)}
				<ProfilePicture class="mr-2" user={otherUser?.user || null} size="3rem" />

				<!-- Chat text -->
				<div class="py-2 pr-3 pl-2 text-lg font-extrabold text-white">
					<div data-tooltip={otherUser?.user.displayName} class="flex items-center space-x-2">
						<p class="line-clamp-1 max-w-[200px] break-all text-white">
							{otherUser?.user.displayName || chat.name}
						</p>
					</div>

					<p class="line-clamp-1 text-sm font-semibold break-all text-gray-400">
						{otherUser ? '@' : ''}{otherUser?.user.username || $t('chat.chat-list.other-left-dm')}
					</p>
				</div>
				<button
					onclick={(event) => handleShowContextMenu(event, chat)}
					aria-label="Options"
					class="absolute right-5 cursor-pointer"
				>
					<Icon icon="mdi:more-vert" class="size-6" />
				</button>
			{:else}
				{@const allParticipants = chat.participants.map((p) => '@' + p.user.username).join(', ')}
				{@const firstTwoParticipants = chat.participants
					.slice(0, 2)
					.map((p) => '@' + p.user.username)}
				{@const remainingCount = chat.participants.length - 2}
				{@const participants =
					remainingCount > 0
						? firstTwoParticipants.join(', ') + ` +${remainingCount} ${$t('chat.chat-list.others')}`
						: firstTwoParticipants.join(', ')}

				<GroupPicture class="mr-2" {chat} size="3rem" />

				<!-- Chat text -->
				<div
					data-tooltip={allParticipants}
					class="py-2 pr-3 pl-2 text-lg font-extrabold text-white"
				>
					<div data-tooltip={chat.name} class="flex items-center space-x-2">
						<Icon icon="mdi:account-group" class="size-5" />

						<p class="line-clamp-1 max-w-[150px] break-all text-white">
							{chat.name}
						</p>
					</div>

					<p class="line-clamp-1 text-sm font-semibold break-all text-gray-400">
						{participants}
					</p>
				</div>
				<button
					onclick={(event) => handleShowContextMenu(event, chat)}
					aria-label="Options"
					class="absolute right-5 cursor-pointer"
				>
					<Icon icon="mdi:more-vert" class="size-6 text-gray-300 hover:text-white" />
				</button>
			{/if}
			{#if chat.unreadMessages && chat.unreadMessages > 0 && chatStore.activeChat?.id !== chat.id}
				<div
					class="absolute right-14 flex h-5 w-5 items-center justify-center rounded-full bg-orange-800/50 text-xs font-semibold text-white"
				>
					{chat.unreadMessages > 9 ? '9+' : chat.unreadMessages}
				</div>
			{/if}
		</div>
	{/each}
	<div class="mt-5 flex items-center justify-center">
		<button
			onclick={() => onCreateChat()}
			disabled={!socketStore.connected}
			class="cursor-pointer rounded-full bg-accent-700/60 px-4 py-2 text-sm font-semibold frosted-glass transition-colors hover:bg-accent-600/50 disabled:bg-gray-600/60 disabled:text-gray-400 disabled:hover:bg-gray-600/60 disabled:hover:text-gray-400"
			>{$t('chat.chat-list.new-chat')}</button
		>
	</div>
</div>
