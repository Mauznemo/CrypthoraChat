<script lang="ts">
	import type { PageProps } from './$types';
	import { socketStore } from '$lib/stores/socket.svelte';
	import { getChatById, getUserById } from '$lib/chat/chat.remote';
	import { onDestroy, onMount } from 'svelte';
	import ChatMessages from '$lib/components/chat/ChatMessages.svelte';
	import type { ChatWithoutMessages } from '$lib/types';
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
	import { chatStore } from '$lib/stores/chat.svelte';
	import { verifyUser } from '$lib/crypto/userVerification';
	import { checkPublicKey } from '$lib/crypto/keyPair';
	import { chats } from '$lib/chat/chats';
	import InfoSideBar from '$lib/components/chat/InfoSideBar.svelte';
	import { infoBarStore } from '$lib/stores/infoBar.svelte';

	let { data }: PageProps = $props();

	let inputField: HTMLTextAreaElement;
	let messageContainer: HTMLDivElement;
	let chatInput: ChatInput;
	let sideBar: SideBar;

	onMount(async () => {
		chatStore.user = data.user;
		document.addEventListener('visibilitychange', handleVisibilityChange);

		const wasConnected = socketStore.connected;

		await checkForMasterKey();

		await checkPublicKey();

		socketStore.connect();

		initializePushNotifications(PUBLIC_VAPID_KEY);

		if (wasConnected) {
			handleConnect();
		}

		socketStore.onNewMessage((m) => {
			messages.handleNewMessage(m);
			scrollToBottom();
		});
		socketStore.onMessageUpdated((m) => {
			messages.handleMessageUpdated(m, { invalidateDecryptionCache: true });
			messages.markReadIfVisible(m);
		});
		socketStore.onMessageDeleted((m) => messages.handleMessageDeleted(m));
		socketStore.onMessagesRead(async (d) => messages.handleMessagesRead(d.messageIds, d.userId));
		socketStore.onNewChat(chats.handleAddedToChatChat);
		socketStore.onRemovedFromChat(chats.handleRemovedFromChat);
		socketStore.onNewSystemMessage((m) => {
			messages.handleNewSystemMessage(m);
			scrollToBottom();
		});
		socketStore.onChatUsersUpdated((d) => chats.handleChatUsersUpdated(d));
		socketStore.onChatUpdated((d) => chats.handleChatUpdated(d));
		socketStore.onConnect(handleConnect);
		socketStore.onUserVerifyRequested((d) => {
			console.log('User @' + d.requestorUsername + ' requested a verification');
			modalStore.open({
				title: 'Verify User Request',
				content: 'User @' + d.requestorUsername + ' requested a verification',
				buttons: [
					{
						text: 'Verify Now',
						variant: 'primary',
						onClick: async () => {
							const user = await getUserById(d.requestorId);
							verifyUser(user, false);
						}
					},
					{
						text: 'Decline',
						variant: 'secondary',
						onClick: () => {}
					}
				]
			});
		});
		socketStore.onKeyRotated(chats.handleKeyRotated);
		socketStore.onMessageError((error) => {
			modalStore.alert('Error', error.error);
			console.error('Socket error:', error);
		});

		scrollToBottom();
	});

	onDestroy(() => {
		//document.removeEventListener('visibilitychange', handleVisibilityChange);

		if (chatStore.activeChat) {
			socketStore.leaveChat(chatStore.activeChat.id);
		}
		socketStore.off('new-message');
		socketStore.off('message-updated');
		socketStore.off('message-deleted');
		socketStore.off('messages-read');
		socketStore.off('new-chat', chats.handleAddedToChatChat);
		socketStore.off('removed-from-chat', chats.handleRemovedFromChat);
		socketStore.off('reconnect', handleConnect);
		socketStore.off('new-system-message');
		socketStore.off('requested-user-verify');
		socketStore.off('chat-users-updated');
		socketStore.off('chat-updated');
		socketStore.off('key-rotated', chats.handleKeyRotated);
		socketStore.off('message-error');

		//socketStore.disconnect();
	});

	function handleVisibilityChange(): void {
		if (!document.hidden && data.user?.id) {
			if (!chatStore.activeChat) return;
			//Maybe re-query messages here instead if problems occur late
			//messages = await getMessagesByChatId(chatId);

			messages.handleVisible();
		}
	}

	async function handleConnect(): Promise<void> {
		chatStore.loadingChat = true;
		const lastChatId = localStorage.getItem('lastChatId');
		if (!lastChatId) {
			chatStore.loadingChat = false;
			return;
		}

		const chat = await getChatById(lastChatId);

		if (!chat) {
			modalStore.alert('Error', 'Failed to load you last selected chat');
			chatStore.loadingChat = false;
			return;
		}

		selectChat(chat);
	}

	function handleCreateChat(): void {
		socketStore.tryLeaveChat(chatStore.activeChat);

		modalStore.open({
			title: 'New Chat',
			content: 'What type of chat would you like to create?',
			buttons: [
				{ text: 'New Direct Message', variant: 'primary', onClick: () => goto('/chat/new/dm') },
				{ text: 'New Group', variant: 'primary', onClick: () => goto('/chat/new/group') }
			]
		});
	}

	function handleScroll(): void {
		if (messageContainer) {
			const { scrollTop, scrollHeight, clientHeight } = messageContainer;
			chatStore.shouldAutoScroll = scrollTop + clientHeight >= scrollHeight - 100;
		}
	}

	function scrollToBottom(): void {
		setTimeout(() => {
			if (chatStore.shouldAutoScroll && messageContainer) {
				messageContainer.scrollTop = messageContainer.scrollHeight;
			}
		}, 100);
	}

	async function selectChat(newChat: ChatWithoutMessages): Promise<void> {
		chatStore.shouldAutoScroll = true;

		const result = await chats.trySelectChat(newChat);

		if (result.success) {
			scrollToBottom();
		}
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
	<SideBar bind:this={sideBar}>
		<ChatList onChatSelected={selectChat} onCreateChat={handleCreateChat} />
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

			<div class="flex items-center">
				<div>
					{#if socketStore.connected}
						<p class="px-3 py-2 text-3xl font-extrabold text-white">Chat</p>
					{:else}
						<p class="px-3 pt-3 text-3xl font-extrabold text-white">Chat - Offline</p>
						<p class="font-semi px-3 pb-1 text-sm text-white/60">
							You may not see all messages in this chat
						</p>
					{/if}
				</div>
				<button
					aria-label="Info"
					class="size-6 cursor-pointer rounded-full"
					onclick={() => infoBarStore.openChatInfo()}
				>
					<svg
						class="h-6 w-6 text-gray-300 hover:text-gray-100"
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
							d="M10 11h2v5m-2 0h4m-2.592-8.5h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
						/>
					</svg>
				</button>
			</div>
		</div>

		{#if !chatStore.activeChat && !chatStore.loadingChat}
			<div class="flex h-full items-center justify-center">
				<p class="text-2xl font-bold">No chat selected</p>
			</div>
		{/if}

		{#if chatStore.loadingChat}
			<div class="flex h-full items-center justify-center">
				<LoadingSpinner />
			</div>
		{:else}
			<ChatMessages
				bind:messageContainer
				{handleScroll}
				onEdit={(message) => {
					chatInput.editMessage(message);
					inputField.focus();
				}}
				onReply={(message) => {
					chatInput.replyToMessage(message);
					inputField.focus();
				}}
				onDelete={(message) => messages.handleDeleteMessage(message)}
				onInfo={messages.handleInfoMessage}
				onReaction={(message) => messages.handleReaction(message, data.user?.id || '')}
				onUpdateReaction={(message, encryptedReaction, operation) =>
					messages.handleUpdateReaction(message, encryptedReaction, operation)}
				onDecryptError={(error, message) => messages.handleDecryptError(error, message, data.user)}
			></ChatMessages>
		{/if}

		<ChatInput bind:this={chatInput} bind:inputField></ChatInput>
	</div>

	<InfoSideBar />
</div>
