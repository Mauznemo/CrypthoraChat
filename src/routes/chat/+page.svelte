<script lang="ts">
	import type { PageProps } from './$types';
	import { socketStore } from '$lib/stores/socket.svelte';
	import { decryptMessage, encryptMessage } from '$lib/crypto/message';
	import {
		getChatById,
		getEncryptedChatKeySeed,
		getMessagesByChatId,
		getUserById,
		saveEncryptedChatKeySeed
	} from './chat.remote';
	import { onDestroy, onMount, untrack } from 'svelte';
	import ChatMessages from '$lib/components/chat/ChatMessages.svelte';

	import type { ChatWithoutMessages, MessageWithRelations } from '$lib/types';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { emojiPickerStore } from '$lib/stores/emojiPicker.svelte';
	import ChatList from '$lib/components/chat/ChatList.svelte';
	import { goto } from '$app/navigation';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { initializePushNotifications } from '$lib/push-notifications';
	import { PUBLIC_VAPID_KEY } from '$env/static/public';
	import {
		decryptChatKeySeedFromStorage,
		encryptChatKeySeedForStorage,
		getChatKeyFromSeed
	} from '$lib/crypto/chat';
	import { emojiKeyConverterStore } from '$lib/stores/emojiKeyConverter.svelte';
	import {
		generateAndStoreMasterKey,
		getMasterSeedForSharing,
		hasMasterKey,
		importAndSaveMasterSeed
	} from '$lib/crypto/master';

	let { data }: PageProps = $props();

	let chatValue: string = $state('');
	let chatInput: HTMLTextAreaElement;
	let messageContainer: HTMLDivElement;
	let typingTimeout: NodeJS.Timeout | null = $state(null);
	let isTyping = $state(false);
	let activeChat: ChatWithoutMessages | null = $state(null);
	let loadingChat = $state(true);
	let chatKey: CryptoKey | null = $state(null);

	let messageReplying: MessageWithRelations | null = $state(null);
	let messageEditing: MessageWithRelations | null = $state(null);

	let messages: MessageWithRelations[] = $state([]);
	let decryptionFailed: Record<string, boolean> = {};

	// Auto-scroll to bottom when new messages arrive
	let shouldAutoScroll = $state(true);

	let chatListComponent: ChatList;

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

	function markReadAfterDelay(messages: MessageWithRelations[]): void {
		setTimeout(() => {
			if (!activeChat) return;
			const readableMessages = messages.filter((message) => decryptionFailed[message.id] !== true);

			socketStore.markMessagesAsRead({
				messageIds: readableMessages.map((message) => message.id),
				chatId: activeChat.id
			});
		}, 500);
	}

	const handleNewMessage = (message: MessageWithRelations) => {
		console.log(
			'New message on websocket. ChatId: ' + message.chatId + ', User: ' + message.user.username
		);
		messages = [...messages, message];
		scrollToBottom();

		if (!activeChat) {
			console.error('No chatId found, failed to mark new message as read');
			return;
		}

		if (message.senderId !== data.user?.id && data.user?.id) {
			if (!document.hidden) {
				// Wait a bit for message to be decrypted or fail at that
				markReadAfterDelay([message]);
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

	const handleNewChat = async (data: {
		chatId: string;
		type: 'dm' | 'group';
		forUsers?: string[];
	}) => {
		const chat = await getChatById(data.chatId);
		if (!chat) return;
		chatListComponent.addChat(chat);
	};

	const sendMessage = async () => {
		if (!activeChat) {
			modalStore.alert('Error', 'Failed to send message: No chat selected');
			return;
		}

		if (!chatValue.trim() || !data.user?.id) return;

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
				senderId: data.user.id,
				encryptedContent: encryptedContent,
				replyToId: messageReplying ? messageReplying.id : null,
				attachments: []
			});
		} catch (error) {
			modalStore.alert('Error', 'Failed to send message: ' + error);
		}

		messageReplying = null;
	};

	const handleInput = () => {
		autoGrow(chatInput);
		if (!data.user?.id) return;
		if (!activeChat) return;

		// Handle typing indicators
		if (!isTyping && chatValue.trim()) {
			isTyping = true;
			socketStore.startTyping({
				chatId: activeChat.id,
				username: data.user.username || 'User'
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
	};

	const handleKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	};

	const handleVisibilityChange = () => {
		if (!document.hidden && data.user?.id) {
			if (!activeChat) return;
			//Maybe re-query messages here instead if problems occur late
			//messages = await getMessagesByChatId(chatId);

			// Mark all unread messages as read
			if (unreadMessages.length > 0) {
				// Filter out messages that failed decryption
				const readableMessages = unreadMessages.filter(
					(messageId) => decryptionFailed[messageId] !== true
				);

				if (readableMessages.length > 0) {
					socketStore.markMessagesAsRead({
						messageIds: readableMessages,
						chatId: activeChat.id
					});
				}

				unreadMessages = []; // Clear the unread list
			}

			// 	if (messages.length > 0) {
			// 		socketStore.markMessagesAsRead({
			// 			messageIds: messages.map((message) => message.id),
			// 			chatId: activeChat.id
			// 		});
			// 	}
		}
	};

	async function handleEditMessage(message: MessageWithRelations): Promise<void> {
		console.log('Edit message:', message.id);
		messageEditing = message;
		chatValue = await decryptMessage(message.encryptedContent, chatKey!);
	}

	function handleReplyMessage(message: MessageWithRelations): void {
		console.log('Reply to message:', message.id);
		messageReplying = message;
	}

	function handleDeleteMessage(message: MessageWithRelations): void {
		if (!activeChat) {
			modalStore.alert('Error', 'Failed to delete message: No chat selected');
			return;
		}
		console.log('Delete message:', message.id);
		modalStore.confirm(
			'Delete Message',
			'Are you sure you want to delete this message?',
			async () => {
				if (!activeChat) return;
				console.log('Message deleted:', message.id);
				socketStore.deleteMessage({ messageId: message.id, chatId: activeChat.id });
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

	function handleDecryptError(error: any, message: MessageWithRelations): void {
		console.log('Decrypt error:', error);

		decryptionFailed[message.id] = true;

		// Check if the user's own key is wrong (chat owner always has correct key)
		const myKeyWrong = message.chat.ownerId === message.user.id;

		if (!myKeyWrong) {
			const lastFail = localStorage.getItem('lastDecryptErrorDate');

			if (lastFail) {
				const lastFailDate = JSON.parse(lastFail);
				const lastFailTime = new Date(lastFailDate).getTime();
				const currentMessageTime = new Date(message.timestamp).getTime();

				// If current message is older than the last failed message, ignore it
				if (currentMessageTime <= lastFailTime) {
					return;
				}
			}
		}

		localStorage.setItem(
			'lastDecryptErrorDate',
			JSON.stringify(new Date(message.timestamp).getTime())
		);

		const userOwnsChat = message.chat.ownerId === data.user?.id;

		if (userOwnsChat) {
			modalStore.alert(
				'Error',
				'Failed to decrypt message by user @' +
					message.user.username +
					'. Please re-share the chat key with them. Since they have a wrong one.'
			);
			return;
		}

		if (myKeyWrong) {
			modalStore.alert(
				'Error',
				'Failed to decrypt message by chat owner @' +
					message.user.username +
					'. This means your chat key is wrong. Please re-input the correct key.',
				{
					onOk: () => modalStore.removeFromQueue('decryption-chat-key-error'),
					id: 'decryption-chat-key-error'
				}
			);
			return;
		}

		modalStore.alert(
			'Error',
			'Failed to decrypt you or the other user might have a wrong chat key. If you are unsure please ask the chat owner, they always have the correct key.'
		);
	}

	function handleCloseEdit(): void {
		messageEditing = null;
		chatValue = '';
	}

	function handleCloseReply(): void {
		messageReplying = null;
	}

	async function handleChatSelected(newChat: ChatWithoutMessages): Promise<void> {
		loadingChat = true;
		console.log('Chat selected (leaving previous):', activeChat?.id);
		if (activeChat) socketStore.leaveChat(activeChat.id);
		if (!activeChat) console.log('Failed to leave previous chat (no active chat)');
		localStorage.setItem('lastChatId', newChat.id);

		decryptionFailed = {};

		const encryptedChatKeySeed = await getEncryptedChatKeySeed(newChat.id);

		if (!encryptedChatKeySeed) {
			modalStore.open({
				title: 'New Chat',
				content:
					'You dont have the key for ' +
					(newChat.type === 'dm'
						? 'the dm with ' + newChat.participants.find((p) => p.id !== data.user?.id)?.displayName
						: newChat.name) +
					' yet. Please get it from ' +
					(newChat.type === 'dm' ? 'them' : 'someone else in the chat who has it') +
					' in a secure way.',
				buttons: [
					{
						text: 'Enter Emoji Sequence',
						variant: 'primary',
						onClick: () => {
							emojiKeyConverterStore.openInput(
								'Enter Emoji Sequence for ' + newChat.name,
								true,
								async (base64Seed) => {
									const chatKeySeedEncrypted = await encryptChatKeySeedForStorage(base64Seed);
									try {
										await saveEncryptedChatKeySeed({
											chatId: newChat.id,
											encryptedKeySeed: chatKeySeedEncrypted
										});
									} catch (err: any) {
										console.error(err);
										modalStore.alert('Error', 'Failed to save chat key: ' + err.body.message);
									}
									emojiKeyConverterStore.close();
									handleChatSelected(newChat);
								}
							);
						}
					},
					{
						text: 'Scan QR Code',
						variant: 'primary',
						onClick: () => {}
					}
				]
			});
			loadingChat = false;
			activeChat = null;
			return;
		}

		try {
			console.log('encrypted chat key seed:', encryptedChatKeySeed);
			const chatKeySeed = await decryptChatKeySeedFromStorage(encryptedChatKeySeed);
			console.log('chat key seed:', chatKeySeed);
			chatKey = await getChatKeyFromSeed(chatKeySeed);
			console.log('chat key:', chatKey);
		} catch (error) {
			loadingChat = false;
			activeChat = null;

			modalStore.open({
				title: 'Error',
				id: 'decryption-chat-key-error',
				content:
					'Failed to decrypt chat key, you might have entered a wrong master key. \n(Error: ' +
					error +
					')',

				buttons: [
					{
						text: 'Re-enter',
						variant: 'primary',
						onClick: () => {
							showMasterKeyImport();
						}
					},
					{
						text: 'OK',
						variant: 'primary'
					}
				]
			});
			return;
		}

		const success = await tryGetMessages(newChat);

		if (success) {
			activeChat = newChat;
			console.log('Joining chat:', activeChat?.id);
			if (!activeChat) {
				alert('Failed to select chat, active chat is: ' + activeChat);
			}
			socketStore.joinChat(activeChat!.id);

			scrollToBottom();

			if (messages.length > 0 && data.user?.id) {
				markReadAfterDelay(messages);
			}
		} else {
			modalStore.alert('Error', 'Failed to select chat, make sure you are online.');
			loadingChat = false;
			activeChat = null;
		}
	}

	function handleCreateChat(): void {
		console.log('Create new chat');
		if (activeChat) socketStore.leaveChat(activeChat.id);

		modalStore.open({
			title: 'New Chat',
			content: 'What type of chat would you like to create?',
			buttons: [
				{ text: 'New Direct Message', variant: 'primary', onClick: () => goto('/chat/new/dm') },
				{ text: 'New Group', variant: 'primary', onClick: () => goto('/chat/new/group') }
			]
		});
	}

	async function tryGetMessages(chat: ChatWithoutMessages | null): Promise<boolean> {
		if (!chat) {
			//modalStore.alert('Error', 'Failed to get messages: No chat selected');
			console.log('No chat selected');
			loadingChat = false;
			return false;
		}
		try {
			await getMessagesByChatId(chat.id).refresh();
			messages = await getMessagesByChatId(chat.id);

			loadingChat = false;
			return true;
		} catch (error: any) {
			if (error.body) {
				modalStore.alert('Error', 'Failed to get messages: ' + error.body.message);
			}
		}

		loadingChat = false;
		return false;
	}

	let sidebarOpen = $state(false);

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	async function resetServiceWorkers() {
		if ('serviceWorker' in navigator) {
			const registrations = await navigator.serviceWorker.getRegistrations();
			for (const registration of registrations) {
				await registration.unregister();
				console.log('Service worker unregistered:', registration);
			}
			window.location.reload();
		}
	}

	async function clearCaches() {
		if ('caches' in window) {
			const cacheNames = await caches.keys();
			for (const name of cacheNames) {
				await caches.delete(name);
				console.log('Cache deleted:', name);
			}
		}
	}

	async function handleConnect() {
		loadingChat = true;
		const lastChatId = localStorage.getItem('lastChatId');
		if (!lastChatId) {
			loadingChat = false;
			return;
		}

		const chat = await getChatById(lastChatId);

		if (!chat) {
			modalStore.alert('Error', 'Failed to load you last selected chat');
			loadingChat = false;
			return;
		}

		handleChatSelected(chat);
	}

	function showMasterKeyImport(): void {
		modalStore.removeFromQueue('decryption-chat-key-error');
		emojiKeyConverterStore.openInput('Import Master Key', false, async (base64Seed) => {
			try {
				await importAndSaveMasterSeed(base64Seed);
			} catch (error) {
				modalStore.alert('Error', 'Failed to import master key: ' + error, {
					onOk: () => {
						emojiKeyConverterStore.clearInput();
					}
				});
				console.error(error);
			}

			emojiKeyConverterStore.close();
		});
	}

	onMount(async () => {
		document.addEventListener('visibilitychange', handleVisibilityChange);

		const wasConnected = socketStore.connected;

		// Connect to socket server
		socketStore.connect();

		if (!hasMasterKey() && !emojiKeyConverterStore.isOpen) {
			modalStore.open({
				title: 'Warning',
				content: 'Could not find your maser key.',
				buttons: [
					{
						text: 'Generate New',
						variant: 'primary',
						onClick: () => {
							modalStore.removeFromQueue('decryption-chat-key-error'); //Content of error would be outdated at this point
							generateAndStoreMasterKey();
						}
					},
					{
						text: 'Import Existing',
						variant: 'primary',
						onClick: () => {
							showMasterKeyImport();
						}
					}
				]
			});
		}

		initializePushNotifications(PUBLIC_VAPID_KEY);

		if (wasConnected) {
			handleConnect();
		}

		// Set up event listeners
		socketStore.onNewMessage(handleNewMessage);
		socketStore.onMessageUpdated(handleMessageUpdated);
		socketStore.onMessageDeleted(handleMessageDeleted);
		socketStore.onMessagesRead(handleMessagesRead);
		socketStore.onNewChat(handleNewChat);
		socketStore.onConnect(handleConnect);
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
		if (activeChat && isTyping && data.user?.id) {
			socketStore.stopTyping({
				chatId: activeChat.id
			});
		}

		// Leave chat room
		if (activeChat) {
			socketStore.leaveChat(activeChat.id);
		}

		// Remove event listeners
		socketStore.off('new-message', handleNewMessage);
		socketStore.off('message-updated', handleMessageUpdated);
		socketStore.off('message-deleted', handleMessageDeleted);
		socketStore.off('messages-read', handleMessagesRead);
		socketStore.off('new-chat', handleNewChat);
		socketStore.off('reconnect', handleConnect);
		socketStore.off('message-error');

		//socketStore.disconnect();
	});
</script>

<div class="flex h-dvh min-h-0">
	<!-- Sidebar - hidden by default on mobile, shown on md+ -->
	<div
		class={`
		fixed
		z-50
		h-full w-80
		min-w-80 border-r
		border-gray-700
		bg-gray-900/80 backdrop-blur-sm
		 transition-transform
		duration-300 md:static
		md:bg-transparent
		${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
	`}
	>
		<div class="flex items-center justify-start p-2">
			<div
				class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gray-500 text-white"
			>
				<p>{data.user?.username?.[0].toUpperCase()}</p>
			</div>
			<p class="ml-2 text-2xl font-bold">{data.user?.username}</p>
		</div>

		<ChatList
			bind:this={chatListComponent}
			bind:selectedChat={activeChat}
			userId={data.user?.id || ''}
			onChatSelected={handleChatSelected}
			onCreateChat={handleCreateChat}
		/>
		<button
			onclick={resetServiceWorkers}
			class="absolute bottom-0 rounded-full bg-gray-700 p-2 text-sm font-bold text-gray-400"
			>Reset Service Workers</button
		>
		<button
			onclick={clearCaches}
			class="absolute bottom-10 rounded-full bg-gray-700 p-2 text-sm font-bold text-gray-400"
			>Clear Caches</button
		>
		<button
			onclick={() => {
				emojiKeyConverterStore.openDisplay(
					"Master Key (Don't share with anyone)",
					false,
					getMasterSeedForSharing()
				);
			}}
			class="absolute bottom-20 rounded-full bg-gray-700 p-2 text-sm font-bold text-gray-400"
			>Show Master Key</button
		>
	</div>

	<!-- Backdrop for mobile -->
	{#if sidebarOpen}
		<div class="bg-opacity-50 fixed inset-0 z-40 md:hidden" onclick={toggleSidebar}></div>
	{/if}

	<div class="flex min-w-0 flex-1 flex-col p-2">
		<div class="mb-5 flex h-15 w-full items-center justify-start space-x-2">
			<!-- Menu button - only shown on mobile -->
			<button
				class="flex h-12 w-12 items-center justify-center rounded-full hover:bg-gray-700 md:hidden"
				onclick={toggleSidebar}
			>
				☰
			</button>

			<!-- Chat text //TODO: Replace with chat name and pic -->

			<div>
				{#if socketStore.connected}
					<p class="px-3 py-2 text-4xl font-extrabold text-white">Chat</p>
				{:else}
					<p class="px-3 pt-3 text-4xl font-extrabold text-white">Chat - Offline</p>
					<p class="font-semi px-3 pb-1 text-sm text-white/60">
						You may not see all messages in this chat
					</p>
				{/if}
			</div>
		</div>

		{#if !activeChat && !loadingChat}
			<div class="flex h-full items-center justify-center">
				<p class="text-2xl font-bold">No chat selected</p>
			</div>
		{/if}

		{#if loadingChat}
			<div class="flex h-full items-center justify-center">
				<LoadingSpinner />
			</div>
		{:else}
			<ChatMessages
				{messages}
				user={data.user}
				chatKey={chatKey!}
				bind:messageContainer
				{handleScroll}
				onEdit={handleEditMessage}
				onReply={handleReplyMessage}
				onDelete={handleDeleteMessage}
				onInfo={handleInfoMessage}
				onReaction={handleReaction}
				onUpdateReaction={handleUpdateReaction}
				onDecryptError={handleDecryptError}
			></ChatMessages>
		{/if}

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
						<p
							class="line-clamp-4 max-w-[40ch] text-sm break-words whitespace-pre-line text-gray-100"
						>
							loading...
						</p>
					{:then decryptedContent}
						<p
							class="line-clamp-4 max-w-[40ch] text-sm break-words whitespace-pre-line text-gray-100"
						>
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
					<span
						>Editing message: {await decryptMessage(
							messageEditing.encryptedContent,
							chatKey!
						)}</span
					>
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
	</div>
</div>
