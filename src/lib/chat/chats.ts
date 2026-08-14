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

const RETRY_DELAYS_MS = [300, 800, 2000, 5000];

/**
 * Reads the RSA-wrapped chat keys, retrying while the wanted version is still missing.
 * The server commits a rotation before this client necessarily knows about it, so a
 * first miss is often just a race rather than a real failure.
 */
async function fetchPublicKeysForVersion(chatId: string, keyVersion: number, retries: number) {
	let publicEncryptedChatKeys = await getPublicEncryptedChatKeys(chatId);

	for (let attempt = 0; attempt < retries; attempt++) {
		if (publicEncryptedChatKeys.some((key) => key.keyVersion === keyVersion)) break;

		await new Promise((resolve) =>
			setTimeout(resolve, RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)])
		);

		const query = getPublicEncryptedChatKeys(chatId);
		if (query.ready) await query.refresh();
		publicEncryptedChatKeys = await query;
	}

	return publicEncryptedChatKeys;
}

/**
 * The participant on the other side of a DM. Returns null for groups, and for a DM the
 * other user has left.
 */
export function getOtherDmUser(
	chat: ChatWithoutMessages | null | undefined,
	currentUserId: string | undefined
): SafeUser | null {
	if (!chat || chat.type !== 'dm') return null;
	return chat.participants.find((p) => p.user.id !== currentUserId)?.user ?? null;
}

export const chats = {
	hasMoreOlder: false,
	hasMoreOlderSystem: false,
	hasMoreNewer: false,
	hasMoreNewerSystem: false,
	oldestCursor: null as string | null,
	oldestSystemCursor: null as string | null,
	newestCursor: null as string | null,
	newestSystemCursor: null as string | null,

	async handleAddedToChatChat(data: { chatId: string; type: 'dm' | 'group' }): Promise<void> {
		try {
			const chat = await getChatById(data.chatId);
			if (!chat) return;
			chatList.addChat(chat);
		} catch (e) {
			// getChatById 403s for non-members; nothing useful to show the user here.
			console.error('Failed to load newly created chat:', e);
		}
	},

	handleRemovedFromChat(data: { chatId: string }): void {
		console.log('Removed from chat:', data);
		const chat = chatStore.chats.find((chat) => chat.id === data.chatId);
		if (chat) chats.tryDeselectChat(chat);
		chatList.removeChat(data.chatId);
	},

	/**
	 * Applies a rotation this tab just performed as the chat owner.
	 *
	 * versionedChatKey is keyed by version alone, so writing into it while a *different*
	 * chat is active would stamp this chat's key onto that one and make everything sent
	 * there undecryptable. Hence the activeChat guard.
	 */
	applyOwnRotation(chatId: string, newKeyVersion: number, newKey: CryptoKey): void {
		console.log('Applying own key rotation for chat:', chatId, 'version:', newKeyVersion);

		const listed = chatStore.chats.find((chat) => chat.id === chatId);
		if (listed) {
			listed.currentKeyVersion = newKeyVersion;
			chatList.updateChat(listed);
		}

		if (chatStore.activeChat?.id !== chatId) return;

		chatStore.versionedChatKey[newKeyVersion] = newKey;
		chatStore.activeChat.currentKeyVersion = newKeyVersion;
	},

	/** Server-sent key-rotated, delivered to every member regardless of selected chat */
	async handleKeyRotated(data: { chatId: string; newKeyVersion: number }): Promise<void> {
		console.log('Key rotated:', data);

		const listed = chatStore.chats.find((chat) => chat.id === data.chatId);
		if (listed && data.newKeyVersion > listed.currentKeyVersion) {
			listed.currentKeyVersion = data.newKeyVersion;
			chatList.updateChat(listed);
		}

		// Not open: the sidebar is up to date and the next select fetches the key.
		if (chatStore.activeChat?.id !== data.chatId) return;

		// Already applied locally — this is the owner's own broadcast coming back.
		if (chatStore.versionedChatKey[data.newKeyVersion]) {
			chatStore.activeChat.currentKeyVersion = data.newKeyVersion;
			return;
		}

		const success = await chats.refreshChatKeys(chatStore.activeChat, data.newKeyVersion);
		if (!success) modalStore.error(get(t)('chat.chats.key-refresh-failed'));
	},

	/**
	 * Re-fetches the chat keys for an already-selected chat and merges them in, keeping
	 * messages and scroll position (a full re-select used to throw both away).
	 */
	async refreshChatKeys(chat: ChatWithoutMessages, expectedKeyVersion: number): Promise<boolean> {
		const chatKeyResult = await chats.tryGetEncryptedChatKeys(
			{ ...chat, currentKeyVersion: expectedKeyVersion },
			{ retries: 4, silent: true }
		);
		if (!chatKeyResult.success) return false;

		const decryptResult = await chats.tryDecryptChatKeys(chatKeyResult.keyVersions);
		if (!decryptResult.success) return false;

		chatStore.versionedChatKey = {
			...chatStore.versionedChatKey,
			...Object.fromEntries(decryptResult.keyVersions.map((item) => [item.keyVersion, item.key]))
		};

		if (chatStore.activeChat?.id === chat.id) {
			chatStore.activeChat.currentKeyVersion = expectedKeyVersion;
		}

		return true;
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

		const chatKeyResult = await chats.tryGetEncryptedChatKeys(currentNewChat, { retries: 3 });

		// Key failures can be transient (a rotation still propagating), so lastChatId is kept
		// here — clearing it left the next mount with no chat to restore.
		if (!chatKeyResult.success) {
			chatStore.resetChatKey();
			chatStore.activeChat = null;
			chatStore.loadingChat = false;
			return { success: false };
		}

		const decryptResult = await chats.tryDecryptChatKeys(chatKeyResult.keyVersions);

		if (!decryptResult.success) {
			chatStore.resetChatKey();
			chatStore.activeChat = null;
			chatStore.loadingChat = false;
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
	async tryGetEncryptedChatKeys(
		chat: ChatWithoutMessages,
		options?: { retries?: number; silent?: boolean }
	): Promise<{
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

				// A rotation the server has committed can still be a moment ahead of what this
				// client sees. Erroring on the first miss made a transient race look permanent.
				const publicEncryptedChatKeys = await fetchPublicKeysForVersion(
					chat.id,
					chat.currentKeyVersion,
					options?.retries ?? 0
				);

				if (publicEncryptedChatKeys.length === 0) {
					if (!options?.silent)
						modalStore.error(
							get(t)('chat.chats.failed-to-get-encrypted-chat-keys-from-public-key')
						);
					return { success: false, keyVersions: [] };
				}

				if (!publicEncryptedChatKeys.some((key) => key.keyVersion === chat.currentKeyVersion)) {
					if (!options?.silent)
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
				if (!options?.silent)
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
