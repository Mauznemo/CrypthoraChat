<script lang="ts">
	import type { PageProps } from './$types';
	import { Prisma } from '$prisma';
	import MyChatMessage from '$lib/components/chat/MyChatMessage.svelte';
	import ChatMessage from '$lib/components/chat/ChatMessage.svelte';

	type MessageWithRelations = Prisma.MessageGetPayload<{
		include: { user: true; chat: true; readBy: true };
	}>;

	let { data }: PageProps = $props();

	let chatValue: string = $state('');
	let chatInput: HTMLTextAreaElement;

	function sendMessage() {
		chatValue = '';
		chatInput.style.height = '5px';
	}

	let messages: MessageWithRelations[] = $state([]);

	let fakeMessages = $state([
		{
			encryptedContent: 'Hello world',
			username: 'user',
			time: '12:00'
		},
		{
			encryptedContent: 'Hello world',
			username: 'user',
			time: '14:32'
		},
		{
			encryptedContent: 'Hello world',
			username: 'user_2',
			time: '15:00'
		},
		{
			encryptedContent: 'Hello world',
			username: 'user_3',
			time: '15:12'
		},
		{
			encryptedContent: 'Hello world',
			username: 'user',
			time: '15:15'
		},
		{
			encryptedContent: 'Hello world',
			username: 'user',
			time: '15:25'
		},
		{
			encryptedContent: 'Hello world',
			username: 'user_1',
			time: '15:45'
		},
		{
			encryptedContent: 'Hello world adda\n adgadhja adfawdgh h ajw dawhgda',
			username: 'user',
			time: '15:46'
		},
		{
			encryptedContent: 'Hello world',
			username: 'user',
			time: '15:47'
		},
		{
			encryptedContent: 'Hello world',
			username: 'user',
			time: '16:12'
		},
		{
			encryptedContent:
				'Hello world efe ad  dawwdf fesadaw  wdwadad wae f  fsgjrkvj jkbjh vkhv khg vhkgv k vgkgvhk vk awdef',
			username: 'user_6',
			time: '16:13'
		},
		{
			encryptedContent: 'Hello world',
			username: 'user',
			time: '16:14'
		},
		{
			encryptedContent: 'Hello world',
			username: 'user',
			time: '16:15'
		},
		{
			encryptedContent: 'Hello world',
			username: 'user',
			time: '16:16'
		},
		{
			encryptedContent: 'Hello world',
			fromMe: true,
			username: 'me',
			readBy: ['user_1', 'user_2'],
			time: '16:17'
		},
		{
			encryptedContent: 'Hello world',
			fromMe: true,
			username: 'me',
			readBy: ['user_1', 'auser_2', 'tuser_3'],
			time: '16:18'
		},
		{
			encryptedContent: 'Hello world',
			username: 'user',
			time: '16:19'
		},
		{
			encryptedContent: 'Hello world',
			fromMe: true,
			username: 'me',
			readBy: [],
			time: '16:20'
		}
	]);

	function autoGrow(element: any) {
		console.log(element);
		element.target.style.height = '5px';
		element.target.style.height = element.target.scrollHeight + 'px';
	}
</script>

<div class="flex h-dvh min-h-0 flex-col p-2">
	<div class="mb-5 flex h-15 w-full items-center justify-start space-x-2">
		<!-- Profile picture -->
		<div
			class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gray-500 text-white"
		>
			<p>{data.user?.username?.[0]}</p>
		</div>

		<!-- Chat text -->
		<div class="px-3 py-2 text-4xl font-extrabold text-white">
			<p>Chat</p>
		</div>
	</div>

	<div class="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
		{#each messages as message, index}
			{@const isFromMe = message.senderId === data.user?.id}
			{@const isFirstInGroup = index === 0 || messages[index - 1].senderId !== message.senderId}
			/*||messages[index - 1].fromMe !== message.fromMe*/
			{@const showProfile = isFirstInGroup}

			{#if isFromMe}
				{@const isLast =
					index === messages.length - 1 || !messages[index + 1].senderId === data.user?.id}
				<MyChatMessage {message} {showProfile} {isLast} />
			{:else}
				<ChatMessage {message} {showProfile} />
			{/if}
		{/each}
	</div>

	<!-- Input Field -->
	<div class="sticky bottom-0 flex w-full gap-2 px-4 pt-2">
		<button class="frosted-glass h-12 w-12 rounded-full bg-gray-600 text-4xl">+</button>

		<textarea
			bind:value={chatValue}
			bind:this={chatInput}
			placeholder="Type your message here..."
			spellcheck="true"
			autocapitalize="sentences"
			autocomplete="off"
			inputmode="text"
			rows="1"
			class="frosted-glass no-scrollbar max-h-60 min-h-12 flex-1 resize-none rounded-4xl border bg-gray-600 px-4 pt-2.5 text-white placeholder:text-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100"
			oninput={autoGrow}
		></textarea>

		<button onclick={sendMessage} class="frosted-glass h-12 w-12 rounded-full bg-gray-600 text-xl"
			>➡️</button
		>
	</div>
</div>
