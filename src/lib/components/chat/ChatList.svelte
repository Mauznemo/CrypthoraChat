<script lang="ts">
	const {
		onChatSelected
	}: {
		onChatSelected: (chatId: string) => void;
	} = $props();

	let activeChat: string = $state('chat');

	const fakeChats = [
		{
			name: 'User',
			type: 'dm',
			id: 'chat',
			newestMessage: 'Hello world'
		},
		{
			name: 'Room',
			type: 'group',
			id: 'chat2',
			newestMessage: 'Really long message that should be truncated'
		}
	];
</script>

<div class="mt-5">
	<p class="px-2 text-sm font-semibold text-gray-300">Chats</p>
	{#each fakeChats as chat, index}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			onclick={() => {
				activeChat = chat.id;
				onChatSelected(chat.id);
			}}
			role="button"
			tabindex="0"
			class="flex h-15 w-full cursor-pointer items-center justify-start space-x-2 px-3 transition-colors {activeChat ===
			chat.id
				? 'bg-teal-700/30'
				: 'hover:bg-gray-700/40 '}"
		>
			<!-- Profile picture -->
			<div
				class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gray-500 text-white"
			>
				<p>{chat.name.charAt(0)}</p>
			</div>

			<!-- Chat text -->
			<div class="py-2 pr-3 pl-2 text-lg font-extrabold text-white">
				<p>{chat.name}</p>
				<p class="line-clamp-1 text-sm font-semibold break-words text-gray-400">
					{chat.newestMessage}
				</p>
			</div>
		</div>
	{/each}
</div>
