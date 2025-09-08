import { decryptKeyWithRSA, getPrivateKey } from '$lib/crypto/keyPair';
import { decryptKeyFromStorage, encryptKeyForStorage } from '$lib/crypto/utils';
import { chatStore } from '$lib/stores/chat.svelte';
import { modalStore } from '$lib/stores/modal.svelte';
import { socketStore } from '$lib/stores/socket.svelte';
import type { ChatParticipant, ChatWithoutMessages, SafeUser } from '$lib/types';

import {
	getChatById,
	getEncryptedChatKeys,
	getMessagesByChatId,
	getPublicEncryptedChatKeys,
	saveEncryptedChatKey
} from './chat.remote';
import { chatList } from './chatList';
import { showMasterKeyImport } from './masterKey';
import {
	markReadAfterDelay,
	resetDecryptionFailed,
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

	handleKeyRotated(): void {
		console.log('Key rotated');
		if (!chatStore.activeChat) return;
		const chat = chatStore.activeChat;
		chatStore.activeChat = null;
		chatStore.resetChatKey();
		chats.trySelectChat(chat);
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

	/** Tries to select a chat and get its messages, shows an error modal if it fails */
	async trySelectChat(newChat: ChatWithoutMessages): Promise<{ success: boolean }> {
		chatStore.loadingChat = true;
		console.log('Chat selected (leaving previous):', chatStore.activeChat?.id);
		socketStore.tryLeaveChat(chatStore.activeChat);
		localStorage.setItem('lastChatId', newChat.id);

		const currentNewChat = await getChatById(newChat.id);

		if (!currentNewChat) {
			chatStore.resetChatKey();
			chatStore.activeChat = null;
			chatStore.loadingChat = false;
			localStorage.removeItem('lastChatId');
			return { success: false };
		}

		chatList.updateChat(currentNewChat);

		resetDecryptionFailed();

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

		const success = await chats.tryGetMessages(currentNewChat);

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
			modalStore.error('Failed to select chat, make sure you are online.');
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
		} catch (error) {
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
					modalStore.error(
						'Failed to get chat key from public key. Try restarting the App or leaving the chat and re-joining if the problem persists.'
					);
					return { success: false, keyVersions: [] };
				}

				if (!publicEncryptedChatKeys.some((key) => key.keyVersion === chat.currentKeyVersion)) {
					modalStore.error(
						'Failed to get chat key from public key: Key Version mismatch. Try restarting the App or leaving the chat and re-joining if the problem persists.'
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
				modalStore.error(e, 'Failed to get chat key from public key:');
			}

			return { success: false, keyVersions: [] };
		}

		return { success: true, keyVersions: encryptedChatKeys.keyVersions };
	},

	/** Tries to get all messages for the chat and shows an error modal if it fails */
	async tryGetMessages(chat: ChatWithoutMessages | null): Promise<boolean> {
		if (!chat) {
			console.log('No chat selected');
			return false;
		}
		try {
			await getMessagesByChatId(chat.id).refresh();
			const messages = await getMessagesByChatId(chat.id);
			setSystemMessages(messages.systemMessages);
			setMessages(messages.messages);

			return true;
		} catch (error: any) {
			if (error.body) {
				modalStore.error(error, 'Failed to get messages:');
			}
		}

		return false;
	}
};
