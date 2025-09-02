<script lang="ts">
	import { onMount } from 'svelte';
	import {
		getEncryptedChatKeySeed,
		getUserChats,
		saveEncryptedChatKeySeed
	} from '../../../routes/chat/chat.remote';
	import type { ChatWithoutMessages } from '$lib/types';
	import LoadingSpinner from '../LoadingSpinner.svelte';
	import { socketStore } from '$lib/stores/socket.svelte';
	import { contextMenuStore, type ContextMenuItem } from '$lib/stores/contextMenu.svelte';
	import { decryptChatKeySeedFromStorage, encryptChatKeySeedForStorage } from '$lib/crypto/chat';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { emojiKeyConverterStore } from '$lib/stores/emojiKeyConverter.svelte';

	let {
		userId,
		selectedChat = $bindable<ChatWithoutMessages | null>(), //do not assign that here, only read!
		onChatSelected,
		onCreateChat
	}: {
		userId: string;
		selectedChat?: ChatWithoutMessages | null;
		onChatSelected: (chat: ChatWithoutMessages) => void;
		onCreateChat: () => void;
	} = $props();

	let chats: ChatWithoutMessages[] = $state([]);
	let loadingChats = $state(true);

	export function addChat(newChat: ChatWithoutMessages): void {
		chats = [...chats, newChat];
	}

	async function handleShowContextMenu(event: Event, chat: ChatWithoutMessages): Promise<void> {
		console.log('showContextMenu');
		event.stopPropagation();
		event.preventDefault();

		const encryptedChatKeySeed = await getEncryptedChatKeySeed(chat.id);

		const items: ContextMenuItem[] = [];
		const isChatOwner = chat.ownerId === userId;

		if (encryptedChatKeySeed && (chat.type === 'group' || isChatOwner)) {
			items.push({
				id: 'share-key',
				label: 'Share Key',
				iconSvg:
					'M17.5 3a3.5 3.5 0 0 0-3.456 4.06L8.143 9.704a3.5 3.5 0 1 0-.01 4.6l5.91 2.65a3.5 3.5 0 1 0 .863-1.805l-5.94-2.662a3.53 3.53 0 0 0 .002-.961l5.948-2.667A3.5 3.5 0 1 0 17.5 3Z',
				action: async () => {
					if (!isChatOwner) {
						modalStore.alert(
							'Note',
							'You are not the chat owner, make sure your key is correct before sharing it with others.'
						);
					}
					try {
						const chatKeySeed = await decryptChatKeySeedFromStorage(encryptedChatKeySeed);
						const title =
							chat.type === 'dm'
								? 'Key for DM with ' + chat.participants.find((p) => p.id !== userId)?.displayName
								: 'Key for group ' + chat.name;
						emojiKeyConverterStore.openDisplay(title, true, chatKeySeed);
					} catch (error) {
						modalStore.alert('Error', 'Failed to decrypt chat key: ' + error);
					}
				}
			});
		}

		if (!isChatOwner) {
			items.push({
				id: 're-input-key',
				label: encryptedChatKeySeed ? 'Re-input Key' : 'Input Key',
				iconSvg: 'M12 7.757v8.486M7.757 12h8.486M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
				action: async () => {
					emojiKeyConverterStore.openInput(
						// TODO: Duplicated code, already exists in chat page, move to lib later
						'Enter Emoji Sequence for ' + chat.name,
						true,
						async (base64Seed) => {
							const chatKeySeedEncrypted = await encryptChatKeySeedForStorage(base64Seed);
							try {
								await saveEncryptedChatKeySeed({
									chatId: chat.id,
									encryptedKeySeed: chatKeySeedEncrypted
								});
							} catch (err: any) {
								console.error(err);
								modalStore.alert('Error', 'Failed to save chat key: ' + err.body.message);
							}
							emojiKeyConverterStore.close();
						}
					);
				}
			});
		}

		if (chat.type === 'group' && isChatOwner) {
			items.push({
				id: 'edit',
				label: 'Edit Group',
				iconSvg:
					'M7 19H5a1 1 0 0 1-1-1v-1a3 3 0 0 1 3-3h1m4-6a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm7.441 1.559a1.907 1.907 0 0 1 0 2.698l-6.069 6.069L10 19l.674-3.372 6.07-6.07a1.907 1.907 0 0 1 2.697 0Z',
				action: () => {}
			});
		}

		if (chat.type === 'group') {
			items.push({
				id: 'add-user',
				label: 'Add Users',
				iconSvg:
					'M16 12h4m-2 2v-4M4 18v-1a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Zm8-10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
				action: () => {}
			});
		}

		items.push({
			id: 'leave',
			label: chat.type === 'group' ? 'Leave Group' : 'Delete Chat',
			iconSvg: 'M20 12H8m12 0-4 4m4-4-4-4M9 4H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h2',
			action: () => console.log('Edit clicked')
		});

		contextMenuStore.open(event.target as HTMLElement, items);
	}

	onMount(async () => {
		loadingChats = true;
		chats = await getUserChats();
		loadingChats = false;
	});
</script>

<div class="mt-5">
	<p class="px-2 text-sm font-semibold text-gray-300">Chats</p>

	{#if loadingChats}
		<div class="flex h-full items-center justify-center p-10">
			<LoadingSpinner />
		</div>
	{/if}
	{#each chats as chat, index}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			onclick={() => {
				onChatSelected(chat);
			}}
			role="button"
			tabindex="0"
			class="flex h-15 w-full cursor-pointer items-center justify-start space-x-2 px-3 transition-colors {selectedChat?.id ===
			chat.id
				? 'bg-teal-700/30'
				: 'hover:bg-gray-700/40 '}"
		>
			{#if chat.type === 'dm'}
				{@const otherUser = chat.participants.find((p) => p.id !== userId)}
				<!-- Profile picture -->
				<div
					class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gray-500 text-white"
				>
					<p>{chat.name?.charAt(0)}</p>
				</div>

				<!-- Chat text -->
				<div class="py-2 pr-3 pl-2 text-lg font-extrabold text-white">
					<div title={otherUser?.username} class="flex items-center space-x-2">
						<p class="line-clamp-1 max-w-[200px] break-all text-white">
							{otherUser?.username}
						</p>
					</div>

					<p class="line-clamp-1 text-sm font-semibold break-all text-gray-400">Not implemented</p>
				</div>
				<button
					onclick={(event) => handleShowContextMenu(event, chat)}
					aria-label="Options"
					class="absolute right-5"
				>
					<svg
						class="h-6 w-6 text-white"
						aria-hidden="true"
						xmlns="http://www.w3.org/2000/svg"
						width="24"
						height="24"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke="currentColor"
							stroke-linecap="round"
							stroke-width="2"
							d="M12 6h.01M12 12h.01M12 18h.01"
						/>
					</svg>
				</button>
			{:else}
				<!-- Profile picture -->
				<div
					class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gray-500 text-white"
				>
					<p>{chat.name?.charAt(0)}</p>
				</div>

				<!-- Chat text -->
				<div class="py-2 pr-3 pl-2 text-lg font-extrabold text-white">
					<div title={chat.name} class="flex items-center space-x-2">
						<svg
							class="mt-1 h-5 w-5 text-white"
							aria-hidden="true"
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							fill="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								fill-rule="evenodd"
								d="M12 6a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm-1.5 8a4 4 0 0 0-4 4 2 2 0 0 0 2 2h7a2 2 0 0 0 2-2 4 4 0 0 0-4-4h-3Zm6.82-3.096a5.51 5.51 0 0 0-2.797-6.293 3.5 3.5 0 1 1 2.796 6.292ZM19.5 18h.5a2 2 0 0 0 2-2 4 4 0 0 0-4-4h-1.1a5.503 5.503 0 0 1-.471.762A5.998 5.998 0 0 1 19.5 18ZM4 7.5a3.5 3.5 0 0 1 5.477-2.889 5.5 5.5 0 0 0-2.796 6.293A3.501 3.501 0 0 1 4 7.5ZM7.1 12H6a4 4 0 0 0-4 4 2 2 0 0 0 2 2h.5a5.998 5.998 0 0 1 3.071-5.238A5.505 5.505 0 0 1 7.1 12Z"
								clip-rule="evenodd"
							/>
						</svg>
						<p class="line-clamp-1 max-w-[150px] break-all text-white">
							{chat.name}
						</p>
					</div>

					<p class="line-clamp-1 text-sm font-semibold break-words text-gray-400">
						Not implemented
					</p>
				</div>
				<button
					onclick={(event) => handleShowContextMenu(event, chat)}
					aria-label="Options"
					class="absolute right-5"
				>
					<svg
						class="h-6 w-6 text-white"
						aria-hidden="true"
						xmlns="http://www.w3.org/2000/svg"
						width="24"
						height="24"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke="currentColor"
							stroke-linecap="round"
							stroke-width="2"
							d="M12 6h.01M12 12h.01M12 18h.01"
						/>
					</svg>
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
