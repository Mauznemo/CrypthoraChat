<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let chatValue: string = $state('');
	let chatInput: HTMLTextAreaElement;

	function sendMessage() {
		fakeMessages.push({
			encryptedContent: chatValue,
			fromMe: true,
			username: 'me',
			readBy: [],
			time: new Date().toLocaleTimeString()
		});
		chatValue = '';
		chatInput.style.height = '5px';
	}

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
		{#each fakeMessages as message, index}
			{@const isFirstInGroup =
				index === 0 ||
				fakeMessages[index - 1].username !== message.username ||
				fakeMessages[index - 1].fromMe !== message.fromMe}
			{@const showProfile = isFirstInGroup}
			{@const isLastFromMe =
				message.fromMe && (index === fakeMessages.length - 1 || !fakeMessages[index + 1].fromMe)}

			<div
				class="m-2 flex items-start space-x-2 {message.fromMe
					? 'flex-row-reverse space-x-reverse'
					: ''}"
			>
				<!-- Profile picture and username (only shown for first message in group) -->
				<div class="flex flex-col items-center space-y-1">
					{#if showProfile}
						<div
							class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-500 text-white shadow-xl"
						>
							<p>{message.username?.charAt(0).toUpperCase() || 'P'}</p>
						</div>
					{:else}
						<!-- Spacer to maintain alignment -->
						<div class="flex h-8 w-8"></div>
					{/if}
				</div>

				<!-- Chat message container -->
				<div class="flex flex-col {message.fromMe ? 'items-end' : 'items-start'} relative">
					<!-- Username (only shown for first message in group and not for own messages) -->
					{#if showProfile && !message.fromMe}
						<div class="mb-0.5 px-1.5">
							<p class="text-sm font-medium text-gray-300">{message.username || 'Unknown'}</p>
						</div>
					{/if}

					<!-- Chat message bubble -->
					<div
						class="frosted-glass-shadow rounded-2xl p-3 {message.fromMe
							? 'bg-teal-700/60'
							: 'bg-gray-700/60'} relative"
					>
						<p class="pr-9 whitespace-pre-line text-white">{message.encryptedContent}</p>
						<!-- Timestamp -->
						<div class="absolute right-2 bottom-1 text-xs text-gray-300 opacity-70">
							{message.time}
						</div>
					</div>

					<!-- Read receipt avatars or checkmark (only for last message sent by me) -->
					{#if isLastFromMe}
						<div class="absolute -bottom-3 flex {message.fromMe ? 'right-2' : 'left-2'} z-10">
							{#if message.readBy && message.readBy.length > 0}
								{#each message.readBy.slice(0, 3) as reader, readIndex}
									<div
										class="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-blue-500 text-xs font-medium text-white shadow-lg"
										style="margin-left: {readIndex > 0 ? '-8px' : '0'}"
									>
										{reader.charAt(0).toUpperCase()}
									</div>
								{/each}
								{#if message.readBy.length > 3}
									<div
										class="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-gray-600 text-xs font-medium text-white shadow-lg"
										style="margin-left: -8px"
									>
										+{message.readBy.length - 3}
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
