<script lang="ts">
	import { onMount } from 'svelte';
	import { getUserChats } from '../../../routes/chat/chat.remote';
	import type { ChatWithoutMessages, SafeUser } from '$lib/types';
	import LoadingSpinner from '../LoadingSpinner.svelte';
	import { socketStore } from '$lib/stores/socket.svelte';

	let {
		userId,
		selectedChat = $bindable<ChatWithoutMessages | null>(),
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
				selectedChat = chat;
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
						<p class="line-clamp-1 break-words text-white">
							{otherUser?.username}
						</p>
					</div>

					<p class="line-clamp-1 text-sm font-semibold break-words text-gray-400">
						Not implemented
					</p>
				</div>
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
							class="mt-1 h-5 w-5 text-gray-800 dark:text-white"
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
						<p class="line-clamp-1 break-words text-white">
							{chat.name}
						</p>
					</div>

					<p class="line-clamp-1 text-sm font-semibold break-words text-gray-400">
						Not implemented
					</p>
				</div>
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
