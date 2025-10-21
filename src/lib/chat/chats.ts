import { decryptKeyWithRSA, getPrivateKey } from '$lib/crypto/keyPair';
import { decryptKeyFromStorage, encryptKeyForStorage } from '$lib/crypto/utils';
import { cancelAllDownloads } from '$lib/fileUpload/upload';
import { chatStore } from '$lib/stores/chat.svelte';
import { modalStore } from '$lib/stores/modal.svelte';
import { socketStore } from '$lib/stores/socket.svelte';
import type { ChatParticipant, ChatWithoutMessages, SafeUser } from '$lib/types';
import { developer } from '$lib/utils/debug';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';

import {
	getChatById,
	getEncryptedChatKeys,
	getMessagesByChatId,
	getPublicEncryptedChatKeys,
	isUserInChat,
	saveEncryptedChatKey
} from './chat.remote';
import { chatList } from './chatList';
import { showMasterKeyImport } from './masterKey';
import {
	addMessages,
	addMessagesAtBeginning,
	markReadAfterDelay,
	setMessages,
	setSystemMessages
} from './messages';

type KeyVersionsEncrypted = {
	keyVersion: number;
	encryptedKey: string;
}[];

type KeyVersions = {
	keyVersion: number;
	key: CryptoKey;
}[];

export const chats = {
	hasMoreOlder: false,
	hasMoreOlderSystem: false,
	hasMoreNewer: false,
	hasMoreNewerSystem: false,
	oldestCursor: null as string | null,
	oldestSystemCursor: null as string | null,
	newestCursor: null as string | null,
	newestSystemCursor: null as string | null,

	async handleAddedToChatChat(data: {
		chatId: string;
		type: 'dm' | 'group';
		forUsers?: string[];
	}): Promise<void> {
		const chat = await getChatById(data.chatId);
		if (!chat) return;
		chatList.addChat(chat);
	},

	handleRemovedFromChat(data: { chatId: string }): void {
		console.log('Removed from chat:', data);
		const chat = chatStore.chats.find((chat) => chat.id === data.chatId);
		if (chat) chats.tryDeselectChat(chat);
		chatList.removeChat(data.chatId);
	},

	handleKeyRotated(ownerData?: { newKeyVersion: number; newKey: CryptoKey }): void {
		console.log('Key rotated');
		if (!chatStore.activeChat) return;
		if (ownerData) {
			chatStore.versionedChatKey[ownerData.newKeyVersion] = ownerData.newKey;
			chatStore.activeChat.currentKeyVersion = ownerData.newKeyVersion;
		} else {
			if (chatStore.activeChat.ownerId === chatStore.user?.id) return;
			const chat = chatStore.activeChat;
			chatStore.activeChat = null;
			chatStore.resetChatKey();
			chats.trySelectChat(chat.id);
		}
	},

	handleChatUsersUpdated(data: {
		chatId: string;
		user?: SafeUser;
		chatParticipant?: ChatParticipant;
		action: 'add' | 'remove';
	}): void {
		console.log('Chat users updated:', data);
		console.log('data.chatId:', data.chatId, 'chatStore.activeChat?.id:', chatStore.activeChat?.id);
		if (data.chatId !== chatStore.activeChat?.id) return;

		if (data.action === 'add') {
			if (data.chatParticipant!.user.id === chatStore.user!.id) return;
			chatStore.activeChat.participants.push(data.chatParticipant!);
		} else if (data.action === 'remove') {
			if (data.user!.id === chatStore.user!.id) return;
			chatStore.activeChat.participants = chatStore.activeChat.participants.filter(
				(participant) => participant.user.id !== data.user!.id
			);
		}

		chatList.updateChat(chatStore.activeChat);
	},

	handleChatUpdated(data: {
		chatId: string;
		newName: string | null;
		newImagePath: string | null;
	}): void {
		if (data.chatId !== chatStore.activeChat?.id) return;
		if (data.newName) chatStore.activeChat.name = data.newName;
		if (data.newImagePath) chatStore.activeChat.imagePath = data.newImagePath;
		chatList.updateChat(chatStore.activeChat);
	},

	/** Tries to select a chat and get its messages, shows an error modal if it fails */
	async trySelectChat(newChatId: string, messagesToLoad = 15): Promise<{ success: boolean }> {
		chatStore.loadingChat = true;
		cancelAllDownloads();
		console.log('Chat selected (leaving previous):', chatStore.activeChat?.id);
		socketStore.tryLeaveChat(chatStore.activeChat);
		localStorage.setItem('lastChatId', newChatId);

		chatStore.resetMessages();

		const userInChat = await isUserInChat(newChatId);

		if (!userInChat) {
			chatStore.resetChatKey();
			chatStore.activeChat = null;
			chatStore.loadingChat = false;
			localStorage.removeItem('lastChatId');
			return { success: false };
		}

		const currentNewChat = await getChatById(newChatId);

		if (!currentNewChat) {
			chatStore.resetChatKey();
			chatStore.activeChat = null;
			chatStore.loadingChat = false;
			localStorage.removeItem('lastChatId');
			return { success: false };
		}

		chatList.updateChat(currentNewChat);

		const chatKeyResult = await chats.tryGetEncryptedChatKeys(currentNewChat);

		if (!chatKeyResult.success) {
			chatStore.resetChatKey();
			chatStore.activeChat = null;
			chatStore.loadingChat = false;
			localStorage.removeItem('lastChatId');
			return { success: false };
		}

		const decryptResult = await chats.tryDecryptChatKeys(chatKeyResult.keyVersions);

		if (!decryptResult.success) {
			chatStore.resetChatKey();
			chatStore.activeChat = null;
			chatStore.loadingChat = false;
			localStorage.removeItem('lastChatId');
			return { success: false };
		}

		const success = await chats.tryGetMessages(currentNewChat, {
			limit: messagesToLoad,
			loadMore: 'older'
		});

		if (success) {
			chatStore.activeChat = currentNewChat;
			console.log('Joining chat:', chatStore.activeChat?.id);
			socketStore.joinChat(chatStore.activeChat.id);

			markReadAfterDelay(chatStore.messages);

			chatStore.versionedChatKey = Object.fromEntries(
				decryptResult.keyVersions.map((item) => [item.keyVersion, item.key])
			);
			chatStore.activeChat = currentNewChat;
			chatStore.loadingChat = false;
			return { success: true };
		} else {
			modalStore.error(get(t)('chat.chats.failed-to-select-chat'));
			chatStore.resetChatKey();
			chatStore.activeChat = null;
			chatStore.loadingChat = false;
			localStorage.removeItem('lastChatId');
			return { success: false };
		}
	},

	/** Deselects the chat if it is selected*/
	tryDeselectChat(chat: ChatWithoutMessages): void {
		if (chatStore.activeChat?.id !== chat.id) return;
		chatStore.activeChat = null;
		chatStore.resetMessages();
		chatStore.resetChatKey();
		socketStore.tryLeaveChat(chat);
	},

	/** Tries to decrypt the chat key and shows an error modal if it fails */
	async tryDecryptChatKeys(
		keyVersions: KeyVersionsEncrypted
	): Promise<{ success: boolean; keyVersions: KeyVersions }> {
		try {
			let chatKeys: KeyVersions = [];

			for (const keyVersion of keyVersions) {
				const chatKey = await decryptKeyFromStorage(keyVersion.encryptedKey);
				chatKeys.push({ keyVersion: keyVersion.keyVersion, key: chatKey });
			}
			return { success: true, keyVersions: chatKeys };
		} catch (error: any) {
			modalStore.open({
				title: get(t)('common.error'),
				id: 'decryption-chat-key-error',
				content: get(t)('chat.chats.failed-to-decrypt-chat-key', { values: { error } }),
				dismissible: false,

				buttons: [
					{
						text: get(t)('chat.chats.re-import-master-key'),
						variant: 'primary',
						onClick: () => {
							showMasterKeyImport();
						}
					},
					{
						text: get(t)('common.ok'),
						variant: 'primary'
					}
				]
			});
			return { success: false, keyVersions: [] };
		}
	},

	/** Tries to get the encrypted chat key for the chat and shows an error modal if it fails */
	async tryGetEncryptedChatKeys(chat: ChatWithoutMessages): Promise<{
		success: boolean;
		keyVersions: KeyVersionsEncrypted;
	}> {
		const encryptedChatKeys = await getEncryptedChatKeys({
			chatId: chat.id,
			keyVersion: chat.currentKeyVersion
		});

		console.log('Encrypted chat keys:', encryptedChatKeys);

		// If the user does not already have the chat key, they first need to get the shared one for them
		if (
			!encryptedChatKeys ||
			!encryptedChatKeys.keyVersions.some((key) => key.keyVersion === chat.currentKeyVersion)
		) {
			try {
				console.log('Getting chat keys from public key');
				const publicEncryptedChatKeys = await getPublicEncryptedChatKeys(chat.id);
				if (publicEncryptedChatKeys.length === 0) {
					modalStore.error(get(t)('chat.chats.failed-to-get-encrypted-chat-keys-from-public-key'));
					return { success: false, keyVersions: [] };
				}

				if (!publicEncryptedChatKeys.some((key) => key.keyVersion === chat.currentKeyVersion)) {
					modalStore.error(
						get(t)('chat.chats.failed-to-get-encrypted-chat-keys-from-public-key-version')
					);
					return { success: false, keyVersions: [] };
				}

				const privateKey = await getPrivateKey();

				let newKeys: KeyVersionsEncrypted = [];

				for (const publicEncryptedChatKey of publicEncryptedChatKeys) {
					const decryptedChatKey = await decryptKeyWithRSA(
						publicEncryptedChatKey.encryptedKey,
						privateKey
					);

					const encryptedChatKey = await encryptKeyForStorage(decryptedChatKey);

					newKeys.push({
						keyVersion: publicEncryptedChatKey.keyVersion,
						encryptedKey: encryptedChatKey
					});

					await saveEncryptedChatKey({
						chatId: chat.id,
						keyVersion: publicEncryptedChatKey.keyVersion,
						encryptedKey: encryptedChatKey
					});
				}

				let keyVersions: KeyVersionsEncrypted = [];

				if (encryptedChatKeys && encryptedChatKeys.keyVersions.length > 0) {
					keyVersions = [...encryptedChatKeys.keyVersions, ...newKeys];
				} else {
					keyVersions = newKeys;
				}

				//await removePublicEncryptedChatKeys(chat.id);
				console.log('Got Key versions from public:', newKeys);

				return { success: true, keyVersions: keyVersions };
			} catch (e: any) {
				console.error(e);
				modalStore.error(
					e,
					get(t)('chat.chats.failed-to-get-encrypted-chat-keys-from-public-key-error')
				);
			}

			return { success: false, keyVersions: [] };
		}

		return { success: true, keyVersions: encryptedChatKeys.keyVersions };
	},

	async tryGetMessages(
		chat: ChatWithoutMessages | null,
		options?: {
			limit?: number;
			loadMore?: 'newer' | 'older';
			cursor?: string;
			systemCursor?: string;
		}
	): Promise<boolean> {
		if (!chat) {
			console.log('No chat selected');
			return false;
		}

		const { limit = 5, loadMore, cursor, systemCursor } = options || {};

		try {
			const result = await getMessagesByChatId({
				chatId: chat.id,
				limit,
				cursor,
				systemCursor,
				direction: loadMore || 'newer'
			});

			const {
				messages,
				systemMessages,
				hasMore,
				hasMoreSystemMessages,
				nextCursor,
				prevCursor,
				nextSystemCursor,
				prevSystemCursor
			} = result;

			if (loadMore === 'older') {
				addMessagesAtBeginning(messages);
				console.log('got older system messages', systemMessages);
				if (systemMessages.length > 0) {
					let newSystemMessages = systemMessages.filter(
						(message) => !chatStore.systemMessages.some((m) => m.id === message.id)
					);
					setSystemMessages([...newSystemMessages, ...chatStore.systemMessages]);
				}
			} else if (loadMore === 'newer') {
				addMessages(messages);
				console.log('got newer system messages', systemMessages);
				if (systemMessages.length > 0) {
					let newSystemMessages = systemMessages.filter(
						(message) => !chatStore.systemMessages.some((m) => m.id === message.id)
					);
					setSystemMessages([...chatStore.systemMessages, ...newSystemMessages]);
				}
			} else {
				// Initial load
				setMessages(messages);
				console.log('got system messages', systemMessages);
				setSystemMessages(systemMessages);
			}

			console.log('result', result);

			// Update cursors separately for each message type
			chats.hasMoreOlder = hasMore && loadMore !== 'newer';
			chats.hasMoreNewer = hasMore && loadMore !== 'older';
			chats.hasMoreOlderSystem = hasMoreSystemMessages && loadMore !== 'newer';
			chats.hasMoreNewerSystem = hasMoreSystemMessages && loadMore !== 'older';

			chats.oldestCursor = loadMore === 'older' ? prevCursor : chats.oldestCursor || prevCursor;
			chats.newestCursor = loadMore === 'newer' ? nextCursor : chats.newestCursor || nextCursor;
			chats.oldestSystemCursor =
				loadMore === 'older' ? prevSystemCursor : chats.oldestSystemCursor || prevSystemCursor;
			chats.newestSystemCursor =
				loadMore === 'newer' ? nextSystemCursor : chats.newestSystemCursor || nextSystemCursor;

			return true;
		} catch (error: any) {
			if (error.body) {
				modalStore.error(error, 'Failed to get messages:');
			}
		}

		return false;
	},

	async loadOlderMessages(chat: ChatWithoutMessages | null): Promise<boolean> {
		if (!chats.hasMoreOlder || !chats.oldestCursor) return false;

		return this.tryGetMessages(chat, {
			loadMore: 'older',
			cursor: chats.oldestCursor,
			systemCursor: chats.oldestSystemCursor || undefined,
			limit: 5
		});
	},

	async loadNewerMessages(chat: ChatWithoutMessages | null): Promise<boolean> {
		if (!chats.hasMoreNewer || !chats.newestCursor) return false;

		return this.tryGetMessages(chat, {
			loadMore: 'newer',
			cursor: chats.newestCursor,
			systemCursor: chats.newestSystemCursor || undefined,
			limit: 5
		});
	}
};
