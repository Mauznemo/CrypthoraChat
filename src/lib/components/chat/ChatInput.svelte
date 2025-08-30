<script lang="ts">
	import { decryptMessage, encryptMessage } from '$lib/crypto/message';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { socketStore } from '$lib/stores/socket.svelte';
	import type { ChatWithoutMessages, MessageWithRelations, SafeUser } from '$lib/types';
	import { onDestroy } from 'svelte';

	let {
		user,
		activeChat,
		chatKey
	}: {
		user: SafeUser | null;
		activeChat: ChatWithoutMessages | null;
		chatKey: CryptoKey;
	} = $props();

	export function replyToMessage(message: MessageWithRelations): void {
		messageReplying = message;
	}

	export async function editMessage(message: MessageWithRelations): Promise<void> {
		messageEditing = message;
		chatValue = await decryptMessage(message.encryptedContent, chatKey!);
		setTimeout(() => autoGrow(chatInput), 100);
	}

	let messageReplying: MessageWithRelations | null = $state(null);
	let messageEditing: MessageWithRelations | null = $state(null);

	let chatInput: HTMLTextAreaElement;
	let typingTimeout: NodeJS.Timeout | null = $state(null);
	let isTyping = $state(false);
	let chatValue: string = $state('');

	onDestroy(() => {
		// Clean up typing timeout
		if (typingTimeout) {
			clearTimeout(typingTimeout);
		}

		// Stop typing indicator if active
		if (activeChat && isTyping && user?.id) {
			socketStore.stopTyping({
				chatId: activeChat.id
			});
		}
	});

	async function sendMessage(): Promise<void> {
		if (!activeChat) {
			modalStore.alert('Error', 'Failed to send message: No chat selected');
			return;
		}

		if (!chatValue.trim() || !user?.id) return;

		const messageContent = chatValue.trim();
		chatValue = '';
		chatInput.style.height = '5px';

		// Stop typing indicator
		if (isTyping) {
			socketStore.stopTyping({
				chatId: activeChat.id
			});
			isTyping = false;
		}

		if (messageEditing) {
			const encryptedContent = await encryptMessage(messageContent, chatKey!);
			socketStore.editMessage({
				messageId: messageEditing.id,
				encryptedContent: encryptedContent
			});

			messageEditing = null;
			return;
		}

		try {
			const encryptedContent = await encryptMessage(messageContent, chatKey!);

			socketStore.sendMessage({
				chatId: activeChat.id,
				senderId: user.id,
				encryptedContent: encryptedContent,
				replyToId: messageReplying ? messageReplying.id : null,
				attachments: []
			});
		} catch (error) {
			modalStore.alert('Error', 'Failed to send message: ' + error);
		}

		messageReplying = null;
	}

	function handleInput(): void {
		autoGrow(chatInput);
		if (!user?.id) return;
		if (!activeChat) return;

		// Handle typing indicators
		if (!isTyping && chatValue.trim()) {
			isTyping = true;
			console.log('start typing');
			socketStore.startTyping({
				chatId: activeChat.id,
				username: user?.username || 'User'
			});
		}

		// Clear existing timeout
		if (typingTimeout) {
			clearTimeout(typingTimeout);
		}

		// Set new timeout to stop typing indicator
		typingTimeout = setTimeout(() => {
			if (isTyping && activeChat) {
				isTyping = false;
				console.log('stop typing');
				socketStore.stopTyping({
					chatId: activeChat.id
				});
			}
		}, 1000);

		if (!chatValue.trim() && isTyping) {
			isTyping = false;
			socketStore.stopTyping({
				chatId: activeChat.id
			});
		}
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	function autoGrow(element: HTMLTextAreaElement): void {
		element.style.height = '5px';
		element.style.height = element.scrollHeight + 'px';
	}

	function handleCloseEdit(): void {
		messageEditing = null;
		chatValue = '';
		setTimeout(() => autoGrow(chatInput), 100);
	}

	function handleCloseReply(): void {
		messageReplying = null;
	}
</script>

{#if socketStore.typing.length > 0}
	<div class="p-2 text-sm font-bold text-gray-400">
		{socketStore.typing.map((user) => user.username).join(', ')}
		{socketStore.typing.length === 1 ? 'is' : 'are'} typing

		<!-- Wave animation dots with enhanced movement -->
		<span class="ml-1 inline-flex space-x-1">
			<span
				class="h-1 w-1 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s] [animation-duration:0.8s]"
			></span>
			<span
				class="h-1 w-1 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s] [animation-duration:0.8s]"
			></span>
			<span
				class="h-1 w-1 animate-bounce rounded-full bg-gray-400 [animation-delay:0s] [animation-duration:0.8s]"
			></span>
		</span>
	</div>
{/if}

{#if messageReplying}
	<svelte:boundary>
		<div class="flex items-center justify-start p-2 text-sm font-bold text-gray-400">
			<button class="mr-2 text-gray-400 hover:text-white" onclick={handleCloseReply}>✕</button>
			{#await decryptMessage(messageReplying.encryptedContent, chatKey!)}
				<p class="line-clamp-4 max-w-[40ch] text-sm break-words whitespace-pre-line text-gray-100">
					loading...
				</p>
			{:then decryptedContent}
				<p class="line-clamp-4 max-w-[40ch] text-sm break-words whitespace-pre-line text-gray-100">
					<span class="font-semibold text-gray-400">Replying to:</span>
					{decryptedContent}
				</p>
			{:catch error}
				<p class="pr-9 whitespace-pre-line text-red-300">Failed to load message</p>
			{/await}
		</div>
	</svelte:boundary>
{/if}

{#if messageEditing}
	<svelte:boundary>
		<div class="flex items-center justify-start p-2 text-sm font-bold text-gray-400">
			<button class="mr-2 text-gray-400 hover:text-white" onclick={handleCloseEdit}>✕</button>
			<span>Editing message: {await decryptMessage(messageEditing.encryptedContent, chatKey)}</span>
		</div>
		{#snippet pending()}
			<p class="p-2 text-sm font-bold text-gray-400">loading...</p>
		{/snippet}
	</svelte:boundary>
{/if}

<!-- Input Field -->
<div class="sticky bottom-0 flex w-full gap-2 px-4 pt-2">
	<button
		class="frosted-glass flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-gray-600 transition-colors hover:bg-teal-600/60"
		aria-label="Add attachments"
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
				stroke-linejoin="round"
				stroke-width="2"
				d="M5 12h14m-7 7V5"
			/>
		</svg>
	</button>

	<textarea
		bind:value={chatValue}
		bind:this={chatInput}
		oninput={handleInput}
		onkeydown={handleKeydown}
		placeholder="Type your message here..."
		spellcheck="true"
		autocapitalize="sentences"
		autocomplete="off"
		inputmode="text"
		rows="1"
		class="frosted-glass no-scrollbar max-h-60 min-h-12 flex-1 resize-none rounded-4xl border bg-gray-600 px-4 pt-2.5 text-white placeholder:text-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100"
	></textarea>

	<button
		disabled={!chatValue.trim() || !socketStore.connected}
		onclick={sendMessage}
		class="frosted-glass flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-teal-600/60 transition-colors hover:bg-teal-600/80 disabled:bg-gray-600"
		aria-label="Send Message"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="2"
			stroke="currentColor"
			class="ml-0.5 size-6"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
			/>
		</svg>
	</button>
</div>
