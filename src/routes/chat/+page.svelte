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
	import { initializePushNotifications } from '$lib/pushNotifications';
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
	import Icon from '@iconify/svelte';
	import { browser } from '$app/environment';
	import { t } from 'svelte-i18n';
	import { toastStore } from '$lib/stores/toast.svelte';

	let { data }: PageProps = $props();

	let inputField: HTMLTextAreaElement;
	let chatInput: ChatInput;
	let sideBar: SideBar;
	let chatName: string | null = $state(null);

	onMount(async () => {
		if (!data || !data.user) {
			goto('/login');
			return;
		}

		chatStore.user = data.user;
		document.addEventListener('visibilitychange', handleVisibilityChange);

		const wasConnected = socketStore.connected;

		await checkForMasterKey();

		await checkPublicKey();

		socketStore.connect();

		initializePushNotifications();

		if (wasConnected) {
			handleConnect();
		}

		socketStore.onNewMessage((m) => {
			messages.handleNewMessage(m);
			if (m.senderId === data?.user?.id) chatStore.scrollView?.lockToBottom();
		});
		socketStore.onNewMessageNotify((d) => {
			messages.handleNewMessageNotify(d);
		});
		socketStore.onMessageUpdated((d) => {
			messages.handleMessageUpdated(d.message, {
				content: d.type === 'edit',
				reactions: d.type === 'reaction'
			});
			messages.markReadIfVisible(d.message);
		});
		socketStore.onMessageDeleted((m) => messages.handleMessageDeleted(m));
		socketStore.onMessagesRead(async (d) => messages.handleMessagesRead(d.messageIds, d.userId));
		socketStore.onNewChat(chats.handleAddedToChatChat);
		socketStore.onRemovedFromChat(chats.handleRemovedFromChat);
		socketStore.onNewSystemMessage((m) => {
			messages.handleNewSystemMessage(m);
		});
		socketStore.onChatUsersUpdated((d) => chats.handleChatUsersUpdated(d));
		socketStore.onChatUpdated((d) => chats.handleChatUpdated(d));
		socketStore.onConnect(handleConnect);
		socketStore.onUserVerifyRequested((d) => {
			console.log('User @' + d.requestorUsername + ' requested a verification');
			modalStore.open({
				title: $t('chat.verification-request-title'),
				content: $t('chat.verification-request-content', {
					values: { username: d.requestorUsername }
				}),
				buttons: [
					{
						text: $t('chat.verify-now'),
						variant: 'primary',
						onClick: async () => {
							const user = await getUserById(d.requestorId);
							verifyUser(user, false);
						}
					},
					{
						text: $t('common.decline'),
						variant: 'secondary',
						onClick: () => {}
					}
				]
			});
		});
		socketStore.onKeyRotated(chats.handleKeyRotated);
		socketStore.onMessageError((error) => {
			modalStore.error(error.error);
			console.error('Socket error:', error);
		});
	});

	onDestroy(() => {
		//document.removeEventListener('visibilitychange', handleVisibilityChange);

		if (chatStore.activeChat) {
			socketStore.leaveChat(chatStore.activeChat.id);
		}
		socketStore.off('new-message');
		socketStore.off('new-message-notify');
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

	function removeQueryParams() {
		const url = window.location.origin + window.location.pathname;
		window.history.replaceState({}, document.title, url);
	}

	async function handleConnect(): Promise<void> {
		chatStore.loadingChat = true;
		const params = new URLSearchParams(window.location.search);
		removeQueryParams();

		let chatId = params.get('chatId');

		if (!chatId) chatId = localStorage.getItem('lastChatId');

		if (!chatId) {
			chatStore.loadingChat = false;
			return;
		}

		const chat = await getChatById(chatId);

		if (!chat) {
			toastStore.error($t('chat.failed-to-select-last-chat'));
			chatStore.loadingChat = false;
			return;
		}

		selectChat(chat);
	}

	function handleCreateChat(): void {
		socketStore.tryLeaveChat(chatStore.activeChat);

		modalStore.open({
			title: $t('chat.create-chat-title'),
			content: $t('chat.create-chat-content'),
			buttons: [
				{ text: $t('chat.new-dm'), variant: 'primary', onClick: () => goto('/chat/new/dm') },
				{ text: $t('chat.new-group'), variant: 'primary', onClick: () => goto('/chat/new/group') }
			]
		});
	}

	let processingChatSelection = false;
	async function selectChat(newChat: ChatWithoutMessages): Promise<void> {
		if (processingChatSelection) return;
		processingChatSelection = true;

		const result = await chats.trySelectChat(newChat);

		if (result.success) {
			if (newChat.type === 'group') {
				chatName = newChat.name;
			} else {
				const otherUser = newChat.participants.find((p) => p.user.id !== chatStore.user?.id);
				chatName = otherUser?.user.displayName || null;
			}

			chatInput.handleChatSelected();
			sideBar?.close();
			// chatStore.scrollView?.scrollToBottom(500);
		}

		processingChatSelection = false;
	}

	if (browser) {
		window.disconnectSocket = () => socketStore.disconnect();
		window.connectSocket = () => {
			socketStore.connect();
			handleConnect();
		};
	}
</script>

<svelte:head>
	<title>{chatName || 'Chat'}</title>
</svelte:head>

<div class="flex h-dvh min-h-0">
	<SideBar bind:this={sideBar}>
		<ChatList onChatSelected={selectChat} onCreateChat={handleCreateChat} />

		<button
			onclick={() => goto('/settings')}
			class="absolute bottom-2 left-2 cursor-pointer rounded-full bg-gray-600 p-2 text-sm font-bold text-gray-200 hover:text-white"
			><Icon icon="mdi:gear" class="size-6" /></button
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

			<div class="flex items-center">
				<div>
					{#if socketStore.connected}
						<p class="px-3 py-2 text-3xl font-extrabold text-white">{chatName || 'Chat'}</p>
					{:else}
						<p class="px-3 pt-3 text-3xl font-extrabold text-white">
							{chatName || 'Chat'} - {$t('common.offline')}
						</p>
						<p class="font-semi px-3 pb-1 text-sm text-white/60">
							{$t('chat.offline-message')}
						</p>
					{/if}
				</div>
				<button
					aria-label="Info"
					class="size-6 cursor-pointer rounded-full"
					onclick={() => infoBarStore.openChatInfo()}
				>
					<Icon class="h-6 w-6 text-gray-300 hover:text-gray-100" icon="mdi:information-outline" />
				</button>
			</div>
		</div>

		{#if !chatStore.activeChat && !chatStore.loadingChat}
			<div class="flex h-full items-center justify-center">
				<p class="text-2xl font-bold">{$t('chat.no-selected-chat')}</p>
			</div>
		{/if}

		{#if chatStore.loadingChat}
			<div class="flex h-full items-center justify-center">
				<LoadingSpinner />
			</div>
		{:else}
			<ChatMessages
				bind:scrollView={chatStore.scrollView!}
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
				onReaction={(message, pos) => messages.handleReaction(message, pos, data.user?.id || '')}
				onUpdateReaction={(message, encryptedReaction, operation) =>
					messages.handleUpdateReaction(message, encryptedReaction, operation)}
				onDecryptError={(error, message) => messages.handleDecryptError(error, message, data.user)}
			></ChatMessages>
		{/if}

		<ChatInput bind:this={chatInput} bind:inputField></ChatInput>
	</div>

	<InfoSideBar />
</div>
