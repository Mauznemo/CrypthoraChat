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
	import { browser } from '$app/environment';
	import { t } from 'svelte-i18n';
	import AddUserToChat from '$lib/components/chat/AddUserToChat.svelte';
	import BigImagePreview from '$lib/components/chat/BigImagePreview.svelte';
	import BigDocumentPreview from '$lib/components/chat/BigDocumentPreview.svelte';
	import { checkWrapperVersion } from '$lib/utils/device';
	import { layoutStore } from '$lib/stores/layout.svelte';
	import CustomTextarea from '$lib/components/chat/CustomTextarea.svelte';
	import { notifyChatOpened, takePendingLaunch } from '$lib/wrapper';
	import { idb } from '$lib/idb';
	import { notificationStore } from '$lib/stores/notifications.svelte';
	import { playNotificationSound } from '$lib/notificationSound';

	let { data }: PageProps = $props();

	let inputField: CustomTextarea;
	let chatInput: ChatInput;
	let sideBar: SideBar;

	// Measured, not assumed: the header grows a second line when a DM is online or the socket is
	// down, and the composer grows with a reply preview, attachments and a multi-line draft. The
	// messages pad themselves by these so the first and last one can still scroll into the clear.
	let headerHeight = $state(0);
	let composerHeight = $state(0);
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

	/**
	 * The service worker cannot play audio and cannot navigate, so it hands both back to the page.
	 */
	function handleServiceWorkerMessage(event: MessageEvent) {
		if (event.data?.type === 'PLAY_NOTIFICATION_SOUND') void playNotificationSound();
		else if (event.data?.type === 'OPEN_CHAT' && event.data.chatId)
			window.goToChat?.(event.data.chatId);
	}

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

		if ('serviceWorker' in navigator)
			navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);

		// onConnect fires immediately when the socket is already up, and again on every
		// reconnect, so there is no separate "was already connected" path to get wrong.
		subscribeToSocketEvents();
	});

	onDestroy(() => {
		if (browser && 'serviceWorker' in navigator)
			navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
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
		// Coming back to a backgrounded tab or PWA is the web equivalent of the wrapper's
		// `setSocketActive` below: whatever arrived for the open chat has now been seen, so its
		// notification and its share of the app icon badge go with it.
		void notificationStore.clearChat(chatStore.activeChat.id);
	}

	/** Appends shared text to the chat's draft, which is what ChatInput loads on selection. */
	async function saveSharedDraft(chatId: string, text: string): Promise<void> {
		if (!idb) return;
		try {
			const existing = await idb.get('draftMessages', chatId);
			const message = existing?.message ? `${existing.message}\n${text}` : text;
			await idb.put('draftMessages', { chatId, message }, chatId);
		} catch (error) {
			console.error('Failed to save shared draft:', error);
		}
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

		// The wrapper sets these before the page mounts, so a notification, shortcut or share that
		// opened the app is honoured even though `goToChat` did not exist yet at that point.
		const pending = takePendingLaunch();

		let chatId = pending.chatId ?? params.get('chatId');

		if (!chatId) chatId = localStorage.getItem('lastChatId');

		if (!chatId) {
			chatStore.loadingChat = false;
			return;
		}

		if (pending.sharedText) await saveSharedDraft(chatId, pending.sharedText);

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

	/**
	 * The chat is already the open one, so there is nothing to select - but a notification tap is
	 * still a request to see what arrived.
	 */
	function focusOpenChat(chatId: string): void {
		notifyChatOpened(chatId);
		void notificationStore.clearChat(chatId);
		chatStore.scrollView?.lockToBottom();
	}

	let processingChatSelection = false;
	/** Only the most recent request matters, so a newer one replaces whatever else was waiting */
	let queuedSelection: { chatId: string; shouldRestoreScrollPos: boolean } | null = null;

	async function selectChat(chatId: string, shouldRestoreScrollPos = false): Promise<void> {
		if (processingChatSelection) {
			// Used to be dropped on the floor, which is how a notification tap landing while the
			// startup selection was still running ended up doing nothing at all.
			queuedSelection = { chatId, shouldRestoreScrollPos };
			return;
		}
		processingChatSelection = true;
		try {
			await runSelectChat(chatId, shouldRestoreScrollPos);
		} finally {
			// A throw in here used to latch the flag and block every later selection for good.
			processingChatSelection = false;
		}

		const queued = queuedSelection;
		queuedSelection = null;
		if (!queued) return;

		if (queued.chatId === chatStore.activeChat?.id) focusOpenChat(queued.chatId);
		else await selectChat(queued.chatId, queued.shouldRestoreScrollPos);
	}

	async function runSelectChat(chatId: string, shouldRestoreScrollPos: boolean): Promise<void> {
		await chatInput.saveDraft();
		await tick();

		let restoreScrollPos = false;
		let messagesToLoad = 15;
		if (chatStore.activeChat && chatStore.activeChat.id === chatId && shouldRestoreScrollPos) {
			restoreScrollPos = true;
			messagesToLoad = chatStore.messages.length < 15 ? 15 : chatStore.messages.length;
			chatStore.scrollView?.findReference();
		} else {
			// The anchor belongs to the chat that was open, and letting it survive lets the
			// ScrollView hold the next chat still at a message that is no longer on screen.
			layoutStore.anchorMessageId = '';
		}

		const result = await chats.trySelectChat(chatId, messagesToLoad);

		if (result.success) {
			chatInput.handleChatSelected();
			// Clears this chat's unread count and notification, in the wrapper app as well as
			// in the web/PWA notifications.
			notifyChatOpened(chatId);
			void notificationStore.clearChat(chatId);
			sideBar?.close();
			if (!restoreScrollPos) {
				// The list lives inside the loadingChat block, so it was destroyed and rebuilt by
				// the selection. Without this the bind:this below has not been reassigned yet and
				// the lock lands on the ScrollView that just went away.
				await tick();
				chatStore.scrollView?.lockToBottom();
			}
		}
	}

	if (browser) {
		window.setSocketActive = () => {
			// connect() is idempotent and listeners survive socket re-creation, so there is no
			// teardown/resubscribe dance here any more (which used to stack duplicate handlers).
			socketStore.connect();
			activityTracker.notifyInteraction();
			// Anything that arrived for the open chat while the app was backgrounded is seen the
			// moment it comes back.
			if (chatStore.activeChat) {
				notifyChatOpened(chatStore.activeChat.id);
				void notificationStore.clearChat(chatStore.activeChat.id);
			}
		};
		window.setSocketInactive = () => {
			activityTracker.suspend();
		};
		window.goToChat = (chatId: string) => {
			if (chatStore.activeChat?.id === chatId) {
				focusOpenChat(chatId);
				return;
			}
			selectChat(chatId);
		};
		// Text shared to one of the Android person shortcuts. It lands in the chat's draft rather
		// than being sent, so the user still gets to look at it before it goes out.
		window.shareToChat = async (chatId: string, text: string) => {
			if (!chatId) return;
			await saveSharedDraft(chatId, text);
			if (chatStore.activeChat?.id === chatId) {
				await chatInput.handleChatSelected();
				return;
			}
			await selectChat(chatId);
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
			class="absolute left-2 cursor-pointer rounded-full frosted-glass bg-gray-600/(--glass-fill-100) p-2 text-sm font-bold text-gray-200 transition-colors hover:bg-gray-500/(--glass-fill-100) hover:text-white"
			><IconMdiGear class="size-6" /></button
		>
	</SideBar>

	<!--
		The messages fill the column on their own and both bars float over them, rather than the
		three sharing a flex column. In a column the scroll container ends where the bars begin,
		so a message was clipped against a hard edge at the top and the bottom; now it passes
		behind them. The bars carry the safe area insets themselves, so the messages can scroll
		all the way under the notch too.
	-->
	<div class="relative min-w-0 flex-1">
		<div class="absolute inset-0">
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
					topInset={headerHeight}
					bottomInset={composerHeight}
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
					onDecryptError={(error, message) =>
						messages.handleDecryptError(error, message, data.user)}
				></ChatMessages>
			{/if}
		</div>

		<!--
			Top bar. Frosted rather than solid, so a message stays visible behind it on its way
			past, and masked so the blur fades out downwards instead of ending on a line.
		-->
		<div
			bind:clientHeight={headerHeight}
			style="padding-top: {layoutStore.safeAreaPadding.top}px;"
			class="pointer-events-none absolute inset-x-0 top-0 z-20 px-2"
		>
			<div class="chat-top-bar absolute inset-0"></div>

			<div
				class="pointer-events-auto relative flex h-15 w-full items-center justify-start space-x-2"
			>
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
						<IconMdiInformationOutline class="h-6 w-6 text-gray-300 hover:text-gray-100" />
					</button>
				</div>
			</div>
		</div>

		<!--
			Bottom bar. Deliberately nothing behind it: the field and the buttons are glass
			themselves, so the messages running under them are what they blur.
		-->
		<div
			bind:clientHeight={composerHeight}
			style="padding-bottom: {layoutStore.safeAreaPadding.bottom + 8}px;"
			class="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-2"
		>
			<div class="pointer-events-auto">
				<ChatInput bind:this={chatInput} bind:inputField></ChatInput>
			</div>
		</div>
	</div>

	<InfoSideBar />
</div>

<AddUserToChat />
<BigImagePreview />
<BigDocumentPreview />

<style>
	/*
	 * The top bar is blur and nothing else: no fill, no sheen, no saturation change, so it has
	 * no colour of its own and takes whatever is behind it. Everything it was given instead -
	 * a tint, the sheen, a lift or a damp on the saturation - made it a band of a slightly
	 * different colour from the panels around it, which is exactly what it should not be. The
	 * only marks it keeps are its own: a definite bottom edge rather than a fade, and the
	 * theme's hairline on it.
	 *
	 * It is its own layer under the title so the frost has nothing of its own to blur through.
	 */
	.chat-top-bar {
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		border-bottom: var(--glass-border-width) solid var(--glass-border-color);
	}
</style>
