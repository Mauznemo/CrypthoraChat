<script lang="ts">
	import type { PageProps } from './$types';
	import { socketStore } from '$lib/stores/socket.svelte';
	import { decryptMessage, encryptMessage } from '$lib/messageCrypto';
	import { getMessagesByChatId, getUserById } from './chat.remote';
	import { onDestroy, onMount } from 'svelte';
	import ChatMessages from '$lib/components/chat/ChatMessages.svelte';

	import type { MessageWithRelations } from '$lib/types';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { emojiPickerStore } from '$lib/stores/emojiPicker.svelte';

	let { data }: PageProps = $props();

	let chatValue: string = $state('');
	let chatInput: HTMLTextAreaElement;
	let messageContainer: HTMLDivElement;
	let typingTimeout: NodeJS.Timeout | null = $state(null);
	let isTyping = $state(false);
	let chatId: string = 'chat';

	let messageReplying: MessageWithRelations | null = $state(null);
	let messageEditing: MessageWithRelations | null = $state(null);

	let messages: MessageWithRelations[] = $state([]);

	// Auto-scroll to bottom when new messages arrive
	let shouldAutoScroll = $state(true);

	function autoGrow(element: HTMLTextAreaElement) {
		element.style.height = '5px';
		element.style.height = element.scrollHeight + 'px';
	}

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

	const handleMessageDeleted = (messageId: string) => {
		messages = messages.filter((m) => m.id !== messageId);
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
				chatId: chatId
			});
			isTyping = false;
		}

		if (messageEditing) {
			const encryptedContent = await encryptMessage(messageContent);
			socketStore.editMessage({
				messageId: messageEditing.id,
				encryptedContent: encryptedContent
			});

			messageEditing = null;
			return;
		}

		try {
			const encryptedContent = await encryptMessage(messageContent);

			socketStore.sendMessage({
				chatId: chatId,
				senderId: data.user.id,
				encryptedContent: encryptedContent,
				replyToId: messageReplying ? messageReplying.id : null,
				attachments: []
			});
		} catch (error) {
			console.error('Failed to send message:', error);
			// You might want to show an error message to the user
		}

		messageReplying = null;
	};

	const handleInput = () => {
		autoGrow(chatInput);
		if (!data.user?.id) return;

		// Handle typing indicators
		if (!isTyping && chatValue.trim()) {
			isTyping = true;
			socketStore.startTyping({
				chatId: chatId,
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
					chatId: chatId
				});
			}
		}, 1000);

		if (!chatValue.trim() && isTyping) {
			isTyping = false;
			socketStore.stopTyping({
				chatId: chatId
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
					chatId: chatId
				});
				unreadMessages = []; // Clear the unread list
			}

			// Also mark all current messages as read
			if (messages.length > 0) {
				socketStore.markMessagesAsRead({
					messageIds: messages.map((message) => message.id),
					chatId: chatId
				});
			}
		}
	};

	async function handleEditMessage(message: MessageWithRelations): Promise<void> {
		console.log('Edit message:', message.id);
		messageEditing = message;
		chatValue = await decryptMessage(message.encryptedContent);
	}

	function handleReplyMessage(message: MessageWithRelations): void {
		console.log('Reply to message:', message.id);
		messageReplying = message;
	}

	function handleDeleteMessage(message: MessageWithRelations): void {
		console.log('Delete message:', message.id);
		modalStore.confirm(
			'Delete Message',
			'Are you sure you want to delete this message?',
			async () => {
				console.log('Message deleted:', message.id);
				socketStore.deleteMessage({ messageId: message.id, chatId: chatId });
			}
		);
	}

	function handleInfoMessage(message: MessageWithRelations): void {
		console.log('Show message info:', message.id);
		const readerNames =
			message.readBy.length > 0 ? message.readBy.map((user) => user.username).join(', ') : 'No one';
		modalStore.alert(
			'Message Info',
			'Sent by: ' + message.user.username + '\nRead by: ' + readerNames
		);
	}

	function handleReaction(message: MessageWithRelations): void {
		console.log('Reaction message:', message.id);
		const messageEl = document.querySelector(`[data-message-id="${message.id}"]`) as HTMLElement;
		const messageBubble = messageEl?.querySelector('.message-bubble') as HTMLElement;
		console.log('Message element:', messageBubble);
		if (messageBubble) {
			emojiPickerStore.open(messageBubble, (emoji: string) => {
				console.log('Selected emoji:', emoji);
				socketStore.reactToMessage({
					messageId: message.id,
					reaction: emoji
				});
			});
		}
	}

	function handleUpdateReaction(
		message: MessageWithRelations,
		emoji: string,
		operation: 'add' | 'remove'
	): void {
		console.log('Update reaction:', message.id, emoji, operation);
		socketStore.updateReaction({
			messageId: message.id,
			reaction: emoji,
			operation
		});
	}

	function handleCloseEdit(): void {
		messageEditing = null;
		chatValue = '';
	}

	function handleCloseReply(): void {
		messageReplying = null;
	}

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
				chatId: chatId
			});
		}

		// Set up event listeners
		socketStore.onNewMessage(handleNewMessage);
		socketStore.onMessageUpdated(handleMessageUpdated);
		socketStore.onMessageDeleted(handleMessageDeleted);
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
				chatId: chatId
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

	<ChatMessages
		{messages}
		user={data.user}
		bind:messageContainer
		{handleScroll}
		onEdit={handleEditMessage}
		onReply={handleReplyMessage}
		onDelete={handleDeleteMessage}
		onInfo={handleInfoMessage}
		onReaction={handleReaction}
		onUpdateReaction={handleUpdateReaction}
	></ChatMessages>

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
				Replying to {messageReplying.user.username}: {await decryptMessage(
					messageReplying.encryptedContent
				)}
			</div>
			{#snippet pending()}
				<p class="p-2 text-sm font-bold text-gray-400">loading...</p>
			{/snippet}
		</svelte:boundary>
	{/if}

	{#if messageEditing}
		<svelte:boundary>
			<div class="flex items-center justify-start p-2 text-sm font-bold text-gray-400">
				<button class="mr-2 text-gray-400 hover:text-white" onclick={handleCloseEdit}>✕</button>
				<span>Editing message: {await decryptMessage(messageEditing.encryptedContent)}</span>
			</div>
			{#snippet pending()}
				<p class="p-2 text-sm font-bold text-gray-400">loading...</p>
			{/snippet}
		</svelte:boundary>
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
