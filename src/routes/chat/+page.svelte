<script lang="ts">
	import type { PageProps } from './$types';
	import type { Prisma } from '$prisma';
	import MyChatMessage from '$lib/components/chat/MyChatMessage.svelte';
	import ChatMessage from '$lib/components/chat/ChatMessage.svelte';
	import { socketStore } from '$lib/stores/socket.svelte';
	import { decryptMessage, encryptMessage } from '$lib/messageCrypto';
	import { getMessagesByChatId, getUserById, testQuery } from './chat.remote';
	import { onDestroy, onMount } from 'svelte';

	type MessageWithRelations = Prisma.MessageGetPayload<{
		include: { user: true; chat: true; readBy: true };
	}>;

	let { data }: PageProps = $props();

	let chatValue: string = $state('');
	let chatInput: HTMLTextAreaElement;
	let messageContainer: HTMLDivElement;
	let typingTimeout: NodeJS.Timeout | null = null;
	let isTyping = $state(false);
	let chatId: string = 'chat';

	let messages: MessageWithRelations[] = $state([]);

	function autoGrow(element: HTMLTextAreaElement) {
		element.style.height = '5px';
		element.style.height = element.scrollHeight + 'px';
	}

	// Auto-scroll to bottom when new messages arrive
	let shouldAutoScroll = $state(true);

	const scrollToBottom = () => {
		if (shouldAutoScroll && messageContainer) {
			setTimeout(() => {
				messageContainer.scrollTop = messageContainer.scrollHeight;
			}, 0);
		}
	};

	const handleScroll = () => {
		if (messageContainer) {
			const { scrollTop, scrollHeight, clientHeight } = messageContainer;
			shouldAutoScroll = scrollTop + clientHeight >= scrollHeight - 100;
		}
	};

	// Track unread messages when page is not visible
	let unreadMessages: string[] = [];

	const handleNewMessage = (message: MessageWithRelations) => {
		messages = [...messages, message];
		scrollToBottom();

		// Mark message as read if it's not from current user and page is visible
		if (message.senderId !== data.user?.id && data.user?.id) {
			if (!document.hidden) {
				socketStore.markMessagesAsRead({
					messageIds: [message.id],
					userId: data.user.id,
					chatId: chatId
				});
			} else {
				// Store unread message ID for later
				unreadMessages = [...unreadMessages, message.id];
			}
		}
	};

	const handleMessageUpdated = (updatedMessage: MessageWithRelations) => {
		const index = messages.findIndex((m) => m.id === updatedMessage.id);
		if (index !== -1) {
			messages[index] = updatedMessage;
		}
	};

	const handleMessagesRead = async (data: { messageIds: string[]; userId: string }) => {
		console.log('Messages read by user:', data.userId, data.messageIds);

		try {
			// Get user from cache/db using the remote function
			const user = await getUserById(data.userId);

			messages = messages.map((message) => {
				if (data.messageIds.includes(message.id)) {
					const isAlreadyRead = message.readBy.some((u) => u.id === data.userId);

					if (!isAlreadyRead) {
						return {
							...message,
							readBy: [...message.readBy, user]
						};
					}
				}
				return message;
			});
		} catch (err) {
			console.error('Failed to get user for read status update:', err);
			// Optionally handle the error - maybe add a placeholder or skip the update
		}
	};

	const sendMessage = async () => {
		if (!chatValue.trim() || !data.user?.id) return;

		const messageContent = chatValue.trim();
		chatValue = '';
		chatInput.style.height = '5px';

		// Stop typing indicator
		if (isTyping) {
			socketStore.stopTyping({
				chatId: chatId,
				userId: data.user.id
			});
			isTyping = false;
		}

		try {
			const encryptedContent = await encryptMessage(messageContent);

			socketStore.sendMessage({
				chatId: chatId,
				senderId: data.user.id,
				encryptedContent: encryptedContent,
				attachments: []
			});
		} catch (error) {
			console.error('Failed to send message:', error);
			// You might want to show an error message to the user
		}
	};

	const handleInput = () => {
		autoGrow(chatInput);
		if (!data.user?.id) return;

		// Handle typing indicators
		if (!isTyping && chatValue.trim()) {
			isTyping = true;
			socketStore.startTyping({
				chatId: chatId,
				userId: data.user.id,
				username: data.user.username || 'User'
			});
		}

		// Clear existing timeout
		if (typingTimeout) {
			clearTimeout(typingTimeout);
		}

		// Set new timeout to stop typing indicator
		typingTimeout = setTimeout(() => {
			if (isTyping) {
				isTyping = false;
				socketStore.stopTyping({
					chatId: chatId,
					userId: data.user!.id
				});
			}
		}, 1000);

		if (!chatValue.trim() && isTyping) {
			isTyping = false;
			socketStore.stopTyping({
				chatId: chatId,
				userId: data.user.id
			});
		}
	};

	const handleKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	};

	const handleVisibilityChange = () => {
		if (!document.hidden && data.user?.id) {
			//Maybe re-query messages here instead if problems occur late
			//messages = await getMessagesByChatId(chatId);

			// Mark all unread messages as read
			if (unreadMessages.length > 0) {
				socketStore.markMessagesAsRead({
					messageIds: unreadMessages,
					userId: data.user.id,
					chatId: chatId
				});
				unreadMessages = []; // Clear the unread list
			}

			// Also mark all current messages as read
			if (messages.length > 0) {
				socketStore.markMessagesAsRead({
					messageIds: messages.map((message) => message.id),
					userId: data.user.id,
					chatId: chatId
				});
			}
		}
	};

	onMount(async () => {
		document.addEventListener('visibilitychange', handleVisibilityChange);

		messages = await getMessagesByChatId(chatId);

		// Connect to socket server
		socketStore.connect();

		// Join the chat room
		if (chatId) {
			socketStore.joinChat(chatId);
		}

		// Mark all messages as read for realtime updates
		if (messages.length > 0 && data.user?.id) {
			socketStore.markMessagesAsRead({
				messageIds: messages.map((message) => message.id),
				userId: data.user.id,
				chatId: chatId
			});
		}

		// Set up event listeners
		socketStore.onNewMessage(handleNewMessage);
		socketStore.onMessageUpdated(handleMessageUpdated);
		socketStore.onMessagesRead(handleMessagesRead);
		socketStore.onMessageError((error) => {
			console.error('Socket error:', error);
		});

		// Initial scroll to bottom
		scrollToBottom();
	});

	onDestroy(() => {
		//document.removeEventListener('visibilitychange', handleVisibilityChange);

		// Clean up typing timeout
		if (typingTimeout) {
			clearTimeout(typingTimeout);
		}

		// Stop typing indicator if active
		if (isTyping && data.user?.id) {
			socketStore.stopTyping({
				chatId: chatId,
				userId: data.user.id
			});
		}

		// Leave chat room
		if (chatId) {
			socketStore.leaveChat(chatId);
		}

		// Remove event listeners
		socketStore.off('new-message', handleNewMessage);
		socketStore.off('message-updated', handleMessageUpdated);
		socketStore.off('messages-read', handleMessagesRead);
		socketStore.off('message-error');
	});
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

	<div
		bind:this={messageContainer}
		onscroll={handleScroll}
		class="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2"
	>
		{#each messages as message, index}
			{@const isFromMe = message.senderId === data.user?.id}
			{@const isFirstInGroup = index === 0 || messages[index - 1].senderId !== message.senderId}
			{@const showProfile = isFirstInGroup}

			{#if isFromMe}
				{@const isLast =
					index === messages.length - 1 || !(messages[index + 1].senderId === data.user?.id)}
				<MyChatMessage {message} userId={data.user?.id || ''} {showProfile} {isLast} />
			{:else}
				<ChatMessage {message} {showProfile} />
			{/if}
		{/each}
	</div>

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

	<!-- Input Field -->
	<div class="sticky bottom-0 flex w-full gap-2 px-4 pt-2">
		<button class="frosted-glass h-12 w-12 rounded-full bg-gray-600 text-4xl">+</button>

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
			class="frosted-glass h-12 w-12 rounded-full bg-gray-600 text-xl">➡️</button
		>
	</div>
</div>
