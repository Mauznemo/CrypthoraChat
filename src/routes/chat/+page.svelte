<script lang="ts">
	import type { PageProps } from './$types';
	import { socketStore } from '$lib/stores/socket.svelte';
	import { getChatById } from './chat.remote';
	import { onDestroy, onMount } from 'svelte';
	import ChatMessages from '$lib/components/chat/ChatMessages.svelte';
	import type { ChatWithoutMessages, ClientMessage } from '$lib/types';
	import { modalStore } from '$lib/stores/modal.svelte';
	import ChatList from '$lib/components/chat/ChatList.svelte';
	import { goto } from '$app/navigation';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { initializePushNotifications } from '$lib/push-notifications';
	import { PUBLIC_VAPID_KEY } from '$env/static/public';
	import { emojiKeyConverterStore } from '$lib/stores/emojiKeyConverter.svelte';
	import { getMasterSeedForSharing } from '$lib/crypto/master';
	import ChatInput from '$lib/components/chat/ChatInput.svelte';
	import * as messages from '$lib/chat/messages';
	import SideBar from '$lib/components/chat/SideBar.svelte';
	import { checkForMasterKey } from '$lib/chat/masterKey';
	import { trySelectChat } from '$lib/chat/chats';

	let { data }: PageProps = $props();

	let activeChat: ChatWithoutMessages | null = $state(null);
	let chatKey: CryptoKey | null = $state(null);

	let messageContainer: HTMLDivElement;
	let chatInput: ChatInput;
	let sideBar: SideBar;
	let chatListComponent: ChatList;

	let currentMessages: ClientMessage[] = $state([]);

	let loadingChat = $state(true);
	let shouldAutoScroll = $state(true);

	onMount(async () => {
		document.addEventListener('visibilitychange', handleVisibilityChange);

		messages.onMessagesUpdated((m) => {
			currentMessages = m;
		});

		const wasConnected = socketStore.connected;

		await checkForMasterKey();

		socketStore.connect();

		initializePushNotifications(PUBLIC_VAPID_KEY);

		if (wasConnected) {
			handleConnect();
		}

		socketStore.onNewMessage((m) => {
			messages.handleNewMessage(m, data.user?.id, activeChat);
			scrollToBottom();
		});
		socketStore.onMessageUpdated((m) => {
			messages.handleMessageUpdated(m, { invalidateDecryptionCache: true });
			messages.markReadIfVisible(m, data.user?.id, activeChat);
		});
		socketStore.onMessageDeleted((m) => messages.handleMessageDeleted(m));
		socketStore.onMessagesRead(async (d) => messages.handleMessagesRead(d.messageIds, d.userId));
		socketStore.onNewChat(handleCreateNewChat);
		socketStore.onConnect(handleConnect);
		socketStore.onMessageError((error) => {
			console.error('Socket error:', error);
		});

		scrollToBottom();
	});

	onDestroy(() => {
		//document.removeEventListener('visibilitychange', handleVisibilityChange);

		if (activeChat) {
			socketStore.leaveChat(activeChat.id);
		}
		socketStore.off('new-message');
		socketStore.off('message-updated');
		socketStore.off('message-deleted');
		socketStore.off('messages-read');
		socketStore.off('new-chat', handleCreateNewChat);
		socketStore.off('reconnect', handleConnect);
		socketStore.off('message-error');

		//socketStore.disconnect();
	});

	function handleVisibilityChange(): void {
		if (!document.hidden && data.user?.id) {
			if (!activeChat) return;
			//Maybe re-query messages here instead if problems occur late
			//messages = await getMessagesByChatId(chatId);

			messages.handleVisible(activeChat);
		}
	}

	async function handleConnect(): Promise<void> {
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

		selectChat(chat);
	}

	function handleCreateChat(): void {
		socketStore.tryLeaveChat(activeChat);

		modalStore.open({
			title: 'New Chat',
			content: 'What type of chat would you like to create?',
			buttons: [
				{ text: 'New Direct Message', variant: 'primary', onClick: () => goto('/chat/new/dm') },
				{ text: 'New Group', variant: 'primary', onClick: () => goto('/chat/new/group') }
			]
		});
	}

	async function handleCreateNewChat(data: {
		chatId: string;
		type: 'dm' | 'group';
		forUsers?: string[];
	}): Promise<void> {
		const chat = await getChatById(data.chatId);
		if (!chat) return;
		chatListComponent.addChat(chat);
	}

	function handleScroll(): void {
		if (messageContainer) {
			const { scrollTop, scrollHeight, clientHeight } = messageContainer;
			shouldAutoScroll = scrollTop + clientHeight >= scrollHeight - 100;
		}
	}

	function scrollToBottom(): void {
		setTimeout(() => {
			if (shouldAutoScroll && messageContainer) {
				messageContainer.scrollTop = messageContainer.scrollHeight;
			}
		}, 0);
	}

	async function selectChat(newChat: ChatWithoutMessages): Promise<void> {
		loadingChat = true;
		shouldAutoScroll = true;

		const result = await trySelectChat(activeChat, data.user?.id || '', newChat);

		if (result.success) {
			chatKey = result.chatKey;
			activeChat = newChat;
			scrollToBottom();
		} else {
			activeChat = null;
		}

		loadingChat = false;
	}

	async function resetServiceWorkers(): Promise<void> {
		if ('serviceWorker' in navigator) {
			const registrations = await navigator.serviceWorker.getRegistrations();
			for (const registration of registrations) {
				await registration.unregister();
				console.log('Service worker unregistered:', registration);
			}
			window.location.reload();
		}
	}

	async function clearCaches(): Promise<void> {
		if ('caches' in window) {
			const cacheNames = await caches.keys();
			for (const name of cacheNames) {
				await caches.delete(name);
				console.log('Cache deleted:', name);
			}
		}
	}
</script>

<div class="flex h-dvh min-h-0">
	<SideBar user={data.user} bind:this={sideBar}>
		<ChatList
			bind:this={chatListComponent}
			bind:selectedChat={activeChat}
			userId={data.user?.id || ''}
			onChatSelected={selectChat}
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
	</SideBar>

	<div class="flex min-w-0 flex-1 flex-col p-2">
		<div class="mb-5 flex h-15 w-full items-center justify-start space-x-2">
			<!-- Menu button - only shown on mobile -->
			<button
				class="flex h-12 w-12 items-center justify-center rounded-full hover:bg-gray-700 md:hidden"
				onclick={sideBar.toggle}
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
				messages={currentMessages}
				user={data.user}
				chatKey={chatKey!}
				bind:messageContainer
				{handleScroll}
				onEdit={chatInput.editMessage}
				onReply={chatInput.replyToMessage}
				onDelete={(message) => messages.handleDeleteMessage(message, activeChat)}
				onInfo={messages.handleInfoMessage}
				onReaction={messages.handleReaction}
				onUpdateReaction={messages.handleUpdateReaction}
				onDecryptError={(error, message) => messages.handleDecryptError(error, message, data.user)}
			></ChatMessages>
		{/if}

		<ChatInput bind:this={chatInput} user={data.user} {activeChat} chatKey={chatKey!}></ChatInput>
	</div>
</div>
