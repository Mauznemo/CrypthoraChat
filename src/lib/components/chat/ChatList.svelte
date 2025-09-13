<script lang="ts">
	import { onMount } from 'svelte';
	import { getUserChats, leaveChat } from '$lib/chat/chat.remote';
	import type { ChatWithoutMessages } from '$lib/types';
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

	let {
		onChatSelected,
		onCreateChat
	}: {
		onChatSelected: (chat: ChatWithoutMessages) => void;
		onCreateChat: () => void;
	} = $props();

	let loadingChats = $state(true);

	async function handleShowContextMenu(event: Event, chat: ChatWithoutMessages): Promise<void> {
		console.log('showContextMenu');
		event.stopPropagation();
		event.preventDefault();

		// const encryptedChatKey = await getEncryptedChatKey(chat.id);

		const items: ContextMenuItem[] = [];
		const isChatOwner = chat.ownerId === chatStore.user?.id;

		// if (encryptedChatKey && (chat.type === 'group' || isChatOwner)) {
		// 	items.push({
		// 		id: 'share-key',
		// 		label: 'Share Key',
		// 		iconSvg:
		// 			'M17.5 3a3.5 3.5 0 0 0-3.456 4.06L8.143 9.704a3.5 3.5 0 1 0-.01 4.6l5.91 2.65a3.5 3.5 0 1 0 .863-1.805l-5.94-2.662a3.53 3.53 0 0 0 .002-.961l5.948-2.667A3.5 3.5 0 1 0 17.5 3Z',
		// 		action: async () => {
		// 			if (!isChatOwner) {
		// 				modalStore.alert(
		// 					'Note',
		// 					'You are not the chat owner, make sure your key is correct before sharing it with others.'
		// 				);
		// 			}
		// 			try {
		// 				const chatKeySeed = await decryptChatKeySeedFromStorage(encryptedChatKeySeed);
		// 				const title =
		// 					chat.type === 'dm'
		// 						? 'Key for DM with ' +
		// 							chat.participants.find((p) => p.id !== chatStore.user?.id)?.displayName
		// 						: 'Key for group ' + chat.name;
		// 				emojiKeyConverterStore.openDisplay(title, true, chatKeySeed);
		// 			} catch (error) {
		// 				modalStore.alert('Error', 'Failed to decrypt chat key: ' + error);
		// 			}
		// 		}
		// 	});
		// }

		if (isChatOwner) {
			items.push({
				id: 'rotate-key',
				label: 'Rotate Key',
				icon: 'mdi:rotate-clockwise',
				action: async () => {
					modalStore.confirm('Rotate Key?', 'Are you sure you want to rotate the key?', () => {
						chatOwner.tryRotateChatKey(chat);
					});
				}
			});

			if (chat.type === 'group') {
				items.push({
					id: 'add-user',
					label: 'Add User',
					icon: 'mdi:account-multiple-add-outline',
					action: () => {
						addUserToChatStore.open(chat);
					}
				});
			}
		}

		if (chat.type === 'group' && isChatOwner) {
			items.push({
				id: 'edit',
				label: 'Edit Group',
				icon: 'mdi:edit-outline',
				action: () => {}
			});
		}

		items.push({
			id: 'leave',
			label: chat.type === 'group' ? 'Leave Group' : 'Delete Chat',
			icon: 'mdi:account-arrow-left-outline',
			action: async () => {
				try {
					await leaveChat(chat.id);
					await deleteFilesThatContain(chat.id);
					chats.tryDeselectChat(chat);
					chatList.removeChat(chat.id);
				} catch (error) {
					modalStore.error(error, 'Failed to leave chat:');
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
	<p class="px-2 text-sm font-semibold text-gray-300">Chats</p>

	{#if loadingChats}
		<div class="flex h-full items-center justify-center p-10">
			<LoadingSpinner />
		</div>
	{/if}
	{#each chatStore.chats as chat, index}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			onclick={() => {
				onChatSelected(chat);
			}}
			role="button"
			tabindex="0"
			class="flex h-15 w-full cursor-pointer items-center justify-start space-x-2 px-3 transition-colors {chatStore
				.activeChat?.id === chat.id
				? 'bg-teal-700/30'
				: 'hover:bg-gray-700/40 '}"
		>
			{#if chat.type === 'dm'}
				{@const otherUser = chat.participants.find((p) => p.user.id !== chatStore.user?.id)}
				<ProfilePicture user={otherUser?.user || null} size="3rem" />

				<!-- Chat text -->
				<div class="py-2 pr-3 pl-2 text-lg font-extrabold text-white">
					<div title={otherUser?.user.displayName} class="flex items-center space-x-2">
						<p class="line-clamp-1 max-w-[200px] break-all text-white">
							{otherUser?.user.displayName}
						</p>
					</div>

					<p class="line-clamp-1 text-sm font-semibold break-all text-gray-400">
						@{otherUser?.user.username}
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
						? firstTwoParticipants.join(', ') + ` +${remainingCount} others`
						: firstTwoParticipants.join(', ')}

				<GroupPicture {chat} size="3rem" />

				<!-- Chat text -->
				<div title={allParticipants} class="py-2 pr-3 pl-2 text-lg font-extrabold text-white">
					<div title={chat.name} class="flex items-center space-x-2">
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
		</div>
	{/each}
	<div class="mt-5 flex items-center justify-center">
		<button
			onclick={() => onCreateChat()}
			disabled={!socketStore.connected}
			class="frosted-glass cursor-pointer rounded-full bg-teal-800/60 px-4 py-2 text-sm font-semibold transition-colors hover:bg-teal-600/60 disabled:bg-gray-600/60 disabled:text-gray-400 disabled:hover:bg-gray-600/60 disabled:hover:text-gray-400"
			>+ New chat</button
		>
	</div>
</div>
