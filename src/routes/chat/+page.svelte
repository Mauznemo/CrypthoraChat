<script lang="ts">
	import type { PageProps } from './$types';
	import { socketStore } from '$lib/stores/socket.svelte';
	import {
		getChatById,
		getEncryptedChatKeySeed,
		getMessagesByChatId,
		saveEncryptedChatKeySeed
	} from './chat.remote';
	import { onDestroy, onMount } from 'svelte';
	import ChatMessages from '$lib/components/chat/ChatMessages.svelte';

	import type { ChatWithoutMessages, MessageWithRelations } from '$lib/types';
	import { modalStore } from '$lib/stores/modal.svelte';
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
	import ChatInput from '$lib/components/chat/ChatInput.svelte';
	import * as messageHandlers from '$lib/chat/messageHandlers';
	import SideBar from '$lib/components/chat/SideBar.svelte';

	let { data }: PageProps = $props();

	let messageContainer: HTMLDivElement;

	let activeChat: ChatWithoutMessages | null = $state(null);
	let loadingChat = $state(true);
	let chatKey: CryptoKey | null = $state(null);

	let chatInput: ChatInput;
	let sideBar: SideBar;
	let chatListComponent: ChatList;

	let messages: MessageWithRelations[] = $state([]);

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

	const handleNewChat = async (data: {
		chatId: string;
		type: 'dm' | 'group';
		forUsers?: string[];
	}) => {
		const chat = await getChatById(data.chatId);
		if (!chat) return;
		chatListComponent.addChat(chat);
	};

	const handleVisibilityChange = () => {
		if (!document.hidden && data.user?.id) {
			if (!activeChat) return;
			//Maybe re-query messages here instead if problems occur late
			//messages = await getMessagesByChatId(chatId);

			messageHandlers.handleVisible(activeChat);
		}
	};

	async function handleChatSelected(newChat: ChatWithoutMessages): Promise<void> {
		loadingChat = true;
		console.log('Chat selected (leaving previous):', activeChat?.id);
		if (activeChat) socketStore.leaveChat(activeChat.id);
		if (!activeChat) console.log('Failed to leave previous chat (no active chat)');
		localStorage.setItem('lastChatId', newChat.id);

		messageHandlers.resetDecryptionFailed();

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
				messageHandlers.markReadAfterDelay(messages, activeChat);
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

		socketStore.onNewMessage((m) => {
			messages = messageHandlers.handleNewMessage(m, data.user?.id, activeChat, messages);
			scrollToBottom();
		});
		socketStore.onMessageUpdated((m) => {
			messages = messageHandlers.handleMessageUpdated(m, messages);
		});
		socketStore.onMessageDeleted((m) => {
			messages = messageHandlers.handleMessageDeleted(m, messages);
		});
		socketStore.onMessagesRead(async (d) => {
			messages = await messageHandlers.handleMessagesRead(d.messageIds, d.userId, messages);
		});
		socketStore.onNewChat(handleNewChat);
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
		socketStore.off('new-chat', handleNewChat);
		socketStore.off('reconnect', handleConnect);
		socketStore.off('message-error');

		//socketStore.disconnect();
	});
</script>

<div class="flex h-dvh min-h-0">
	<SideBar user={data.user} bind:this={sideBar}>
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
				{messages}
				user={data.user}
				chatKey={chatKey!}
				bind:messageContainer
				{handleScroll}
				onEdit={chatInput.editMessage}
				onReply={chatInput.replyToMessage}
				onDelete={(message) => messageHandlers.handleDeleteMessage(message, activeChat)}
				onInfo={messageHandlers.handleInfoMessage}
				onReaction={messageHandlers.handleReaction}
				onUpdateReaction={messageHandlers.handleUpdateReaction}
				onDecryptError={(error, message) =>
					messageHandlers.handleDecryptError(error, message, data.user)}
			></ChatMessages>
		{/if}

		<ChatInput bind:this={chatInput} user={data.user} {activeChat} chatKey={chatKey!}></ChatInput>
	</div>
</div>
