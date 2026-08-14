<script lang="ts">
	import type { PageProps } from './$types';
	import { socketStore, socketListeners, type SocketListeners } from '$lib/stores/socket.svelte';
	import { chatList } from '$lib/chat/chatList';
	import { onDestroy, onMount, tick } from 'svelte';
	import ChatMessages from '$lib/components/chat/ChatMessages.svelte';
	import { modalStore } from '$lib/stores/modal.svelte';
	import ChatList from '$lib/components/chat/ChatList.svelte';
	import { goto } from '$app/navigation';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { initializePushNotifications } from '$lib/pushNotifications';
	import ChatInput from '$lib/components/chat/ChatInput.svelte';
	import * as messages from '$lib/chat/messages';
	import SideBar from '$lib/components/chat/SideBar.svelte';
	import { checkForMasterKey } from '$lib/chat/masterKey';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { checkPublicKey } from '$lib/crypto/keyPair';
	import { chats, getOtherDmUser } from '$lib/chat/chats';
	import { presenceStore } from '$lib/stores/presence.svelte';
	import { activityTracker } from '$lib/activityTracker';
	import InfoSideBar from '$lib/components/chat/InfoSideBar.svelte';
	import { infoBarStore } from '$lib/stores/infoBar.svelte';
	import Icon from '@iconify/svelte';
	import { browser } from '$app/environment';
	import { t } from 'svelte-i18n';
	import AddUserToChat from '$lib/components/chat/AddUserToChat.svelte';
	import BigImagePreview from '$lib/components/chat/BigImagePreview.svelte';
	import BigDocumentPreview from '$lib/components/chat/BigDocumentPreview.svelte';
	import { checkWrapperVersion } from '$lib/utils/device';
	import { layoutStore } from '$lib/stores/layout.svelte';
	import CustomTextarea from '$lib/components/chat/CustomTextarea.svelte';

	let { data }: PageProps = $props();

	let inputField: CustomTextarea;
	let chatInput: ChatInput;
	let sideBar: SideBar;
	let otherDmUser = $derived(getOtherDmUser(chatStore.activeChat, chatStore.user?.id));
	let chatName: string | null = $derived.by(() => {
		if (chatStore.activeChat) {
			if (chatStore.activeChat.type === 'group') {
				return chatStore.activeChat.name;
			} else {
				return otherDmUser?.displayName || null;
			}
		}
		return null;
	});

	// The DM peer is the only user whose presence the chat view itself needs; group members
	// are fetched by the info bar, only while it is open.
	$effect(() => {
		if (otherDmUser) presenceStore.refresh([otherDmUser.id]);
	});

	onMount(async () => {
		if (!data || !data.user) {
			goto('/login');
			return;
		}

		chatStore.user = data.user;

		await checkForMasterKey();

		await checkPublicKey();

		checkWrapperVersion();

		socketStore.connect();
		// Only the chat page reports itself as foreground, so a user parked on another
		// page still receives push notifications for new messages. The tracker also drops
		// the session back to background once the user stops interacting with it, so a tab
		// left open on a second monitor no longer suppresses notifications forever.
		activityTracker.start(handleVisible);

		initializePushNotifications();

		// onConnect fires immediately when the socket is already up, and again on every
		// reconnect, so there is no separate "was already connected" path to get wrong.
		subscribeToSocketEvents();
	});

	onDestroy(() => {
		unsubscribeFromSocketEvents();
		// Also removes the visibilitychange listener, which used to leak on every unmount.
		activityTracker.stop();
	});

	let listeners: SocketListeners | null = null;

	function subscribeToSocketEvents() {
		// Idempotent: re-subscribing never stacks handlers.
		unsubscribeFromSocketEvents();
		const l = (listeners = socketListeners());

		l.add(
			socketStore.onNewMessage((m) => {
				messages.handleNewMessage(m);
				if (m.senderId === data?.user?.id) chatStore.scrollView?.lockToBottom();
			})
		);
		l.add(
			socketStore.onNewMessageNotify((d) => {
				messages.handleNewMessageNotify(d);
			})
		);
		l.add(
			socketStore.onMessageUpdated((d) => {
				messages.handleMessageUpdated(d.message, {
					content: d.type === 'edit',
					reactions: d.type === 'reaction'
				});
				messages.markReadIfVisible(d.message);
			})
		);
		l.add(socketStore.onMessageDeleted((m) => messages.handleMessageDeleted(m)));
		l.add(
			socketStore.onMessagesRead(async (d) => messages.handleMessagesRead(d.messageIds, d.userId))
		);
		l.add(socketStore.onNewChat(chats.handleAddedToChatChat));
		l.add(socketStore.onRemovedFromChat(chats.handleRemovedFromChat));
		l.add(
			socketStore.onNewSystemMessage((m) => {
				messages.handleNewSystemMessage(m);
			})
		);
		l.add(socketStore.onChatUsersUpdated((d) => chats.handleChatUsersUpdated(d)));
		l.add(socketStore.onChatUpdated((d) => chats.handleChatUpdated(d)));
		l.add(socketStore.onUserPresence((d) => presenceStore.set(d.userId, d.presence === 'online')));
		l.add(socketStore.onConnect((isReconnect) => handleConnect(isReconnect)));
		l.add(socketStore.onKeyRotated((d) => chats.handleKeyRotated(d)));
		l.add(
			socketStore.onMessageError((error) => {
				modalStore.error(error.error);
				console.error('Socket error:', error);
			})
		);
		// Verification requests are handled globally in VerificationListener, so they still
		// arrive when the user is sitting on /settings or /chat/new/dm.
	}

	function unsubscribeFromSocketEvents() {
		if (chatStore.activeChat) {
			socketStore.leaveChat(chatStore.activeChat.id);
		}
		listeners?.dispose();
		listeners = null;
	}

	/** Presence itself is handled by activityTracker; this is the unrelated half */
	function handleVisible(): void {
		if (!data.user?.id) return;
		if (!chatStore.activeChat) return;
		//Maybe re-query messages here instead if problems occur late
		//messages = await getMessagesByChatId(chatId);

		messages.handleVisible();
	}

	function removeQueryParams() {
		const url = window.location.origin + window.location.pathname;
		window.history.replaceState({}, document.title, url);
	}

	async function handleConnect(isReconnect = false): Promise<void> {
		// A reconnect is a brand new socket, which the server registers as background. Without
		// this the user would keep getting push notifications for the chat they are looking at.
		// Routed through the tracker so a reconnect while idle does not resurrect 'active'.
		activityTracker.reassert();

		if (isReconnect) {
			// Presence pushed while we were disconnected is gone; re-seed what is on screen.
			presenceStore.clear();
			if (otherDmUser) presenceStore.refresh([otherDmUser.id]);
			// Nothing is queued server side, so a new-chat-created that landed while we were
			// disconnected is only recoverable by re-reading the list.
			await chatList.refresh({ force: true });
			// Socket.IO rooms are per-socket and lost on every reconnect. Rejoin explicitly:
			// the selectChat below is skipped entirely when there is no stored chatId.
			if (chatStore.activeChat) socketStore.joinChat(chatStore.activeChat.id);
		}

		chatStore.loadingChat = true;
		const params = new URLSearchParams(window.location.search);
		removeQueryParams();

		let chatId = params.get('chatId');

		if (!chatId) chatId = localStorage.getItem('lastChatId');

		if (!chatId) {
			chatStore.loadingChat = false;
			return;
		}

		selectChat(chatId, isReconnect);
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
	async function selectChat(chatId: string, shouldRestoreScrollPos = false): Promise<void> {
		if (processingChatSelection) return;
		processingChatSelection = true;
		await chatInput.saveDraft();
		await tick();

		let restoreScrollPos = false;
		let messagesToLoad = 15;
		if (chatStore.activeChat && chatStore.activeChat.id === chatId && shouldRestoreScrollPos) {
			restoreScrollPos = true;
			messagesToLoad = chatStore.messages.length < 15 ? 15 : chatStore.messages.length;
			chatStore.scrollView?.findReference();
		}

		const result = await chats.trySelectChat(chatId, messagesToLoad);

		if (result.success) {
			chatInput.handleChatSelected();
			sideBar?.close();
			if (!restoreScrollPos) {
				chatStore.scrollView?.lockToBottom();
			}
		}

		processingChatSelection = false;
	}

	if (browser) {
		window.setSocketActive = () => {
			// connect() is idempotent and listeners survive socket re-creation, so there is no
			// teardown/resubscribe dance here any more (which used to stack duplicate handlers).
			socketStore.connect();
			activityTracker.notifyInteraction();
		};
		window.setSocketInactive = () => {
			activityTracker.suspend();
		};
		window.onFlutterSafeAreaInsetsChanged = () => {
			layoutStore.updateSafeAreaPadding();
		};
		window.goToChat = (chatId: string) => {
			if (chatStore.activeChat?.id === chatId) return;
			selectChat(chatId);
		};
		// Called by the wrapper app after its FCM token rotated, so the new one gets registered
		window.reRegisterPush = () => {
			initializePushNotifications();
		};
	}
</script>

<svelte:head>
	<title>{chatName || $t('chat.chat')}</title>
</svelte:head>

<div class="flex h-full min-h-0">
	<SideBar bind:this={sideBar}>
		<ChatList onChatSelected={selectChat} onCreateChat={handleCreateChat} />

		<button
			onclick={() => goto('/settings')}
			style="bottom: {layoutStore.safeAreaPadding.bottom + 8}px;"
			class="absolute left-2 cursor-pointer rounded-full bg-gray-600 p-2 text-sm font-bold text-gray-200 hover:text-white"
			><Icon icon="mdi:gear" class="size-6" /></button
		>
	</SideBar>

	<div
		style="padding-top: {layoutStore.safeAreaPadding.top}px; padding-bottom: {layoutStore
			.safeAreaPadding.bottom + 8}px;"
		class="flex min-w-0 flex-1 flex-col p-2"
	>
		<div class="mb-5 flex h-15 w-full items-center justify-start space-x-2">
			<!-- Menu button - only shown on mobile -->
			<button
				class="flex h-12 w-12 items-center justify-center rounded-full pt-1 text-3xl hover:bg-gray-700 md:hidden"
				onclick={sideBar.toggle}
			>
				☰
			</button>

			<div class="flex items-center">
				<div>
					{#if socketStore.connected}
						{@const dmOnline = presenceStore.isOnline(otherDmUser?.id)}
						<p
							class="line-clamp-1 px-3 text-3xl font-extrabold break-all text-white {dmOnline
								? 'pt-3'
								: 'py-2'}"
						>
							{chatName || $t('chat.chat')}
						</p>
						{#if dmOnline}
							<div class="flex items-center space-x-1.5 px-3 pb-1">
								<span class="size-2 rounded-full bg-green-500"></span>
								<p class="text-sm text-white/60">{$t('chat.online')}</p>
							</div>
						{/if}
					{:else}
						<p class="line-clamp-1 px-3 pt-3 text-3xl font-extrabold break-all text-white">
							{chatName || $t('chat.chat')} - {$t('common.offline')}
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
		{:else if chatStore.activeChat}
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

<AddUserToChat />
<BigImagePreview />
<BigDocumentPreview />
