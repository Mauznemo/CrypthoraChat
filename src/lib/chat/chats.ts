import { decryptKeyWithRSA, getPrivateKey } from '$lib/crypto/keyPair';
import { decryptKeyFromStorage, encryptKeyForStorage } from '$lib/crypto/utils';
import { chatStore } from '$lib/stores/chat.svelte';
import { modalStore } from '$lib/stores/modal.svelte';
import { socketStore } from '$lib/stores/socket.svelte';
import type { ChatWithoutMessages } from '$lib/types';
import {
	getEncryptedChatKey,
	getMessagesByChatId,
	getPublicEncryptedChatKey,
	saveEncryptedChatKey
} from '../../routes/chat/chat.remote';
import { showMasterKeyImport } from './masterKey';
import { markReadAfterDelay, resetDecryptionFailed, setMessages } from './messages';

/** Tries to select a chat and get its messages, shows an error modal if it fails */
export async function trySelectChat(newChat: ChatWithoutMessages): Promise<{ success: boolean }> {
	console.log('Chat selected (leaving previous):', chatStore.activeChat?.id);
	socketStore.tryLeaveChat(chatStore.activeChat);
	localStorage.setItem('lastChatId', newChat.id);

	resetDecryptionFailed();

	const chatKeyResult = await tryGetEncryptedChatKey(newChat);

	if (!chatKeyResult.success) {
		chatStore.chatKey = null;
		chatStore.activeChat = null;
		return { success: false };
	}

	const decryptResult = await tryDecryptChatKey(chatKeyResult.encryptedChatKey);

	if (!decryptResult.success) {
		chatStore.chatKey = null;
		chatStore.activeChat = null;
		return { success: false };
	}

	const success = await tryGetMessages(newChat);

	if (success) {
		chatStore.activeChat = newChat;
		console.log('Joining chat:', chatStore.activeChat?.id);
		socketStore.joinChat(chatStore.activeChat.id);

		markReadAfterDelay(chatStore.messages);

		chatStore.chatKey = decryptResult.chatKey;
		chatStore.activeChat = newChat;
		return { success: true };
	} else {
		modalStore.error('Failed to select chat, make sure you are online.');
		chatStore.chatKey = null;
		chatStore.activeChat = null;
		return { success: false };
	}
}

/** Tries to decrypt the chat key and shows an error modal if it fails */
export async function tryDecryptChatKey(
	encryptedChatKey: string
): Promise<{ success: boolean; chatKey: CryptoKey | null }> {
	try {
		console.log('encrypted chat key seed:', encryptedChatKey);
		const chatKey = await decryptKeyFromStorage(encryptedChatKey);
		return { success: true, chatKey };
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
		return { success: false, chatKey: null };
	}
}

/** Tries to get the encrypted chat key for the chat and shows an error modal if it fails */
export async function tryGetEncryptedChatKey(
	chat: ChatWithoutMessages
): Promise<{ success: boolean; encryptedChatKey: string }> {
	const encryptedChatKey = await getEncryptedChatKey(chat.id);

	if (!encryptedChatKey) {
		try {
			console.log('Getting chat key from public key');
			const publicEncryptedChatKey = await getPublicEncryptedChatKey(chat.id);
			if (!publicEncryptedChatKey) {
				modalStore.error(
					'Failed to get chat key from public key. Try leaving the chat and re-joining if the problem persists.'
				);
				return { success: false, encryptedChatKey: '' };
			}

			const privateKey = await getPrivateKey();

			const decryptedChatKey = await decryptKeyWithRSA(publicEncryptedChatKey, privateKey);

			const encryptedChatKey = await encryptKeyForStorage(decryptedChatKey);

			await saveEncryptedChatKey({
				chatId: chat.id,
				encryptedKey: encryptedChatKey
			});

			return { success: true, encryptedChatKey: encryptedChatKey };
		} catch (e: any) {
			console.error(e);
			modalStore.error(e, 'Failed to get chat key from public key:');
		}

		return { success: false, encryptedChatKey: '' };
	}

	return { success: true, encryptedChatKey };
}

/** Tries to get all messages for the chat and shows an error modal if it fails */
export async function tryGetMessages(chat: ChatWithoutMessages | null): Promise<boolean> {
	if (!chat) {
		console.log('No chat selected');
		return false;
	}
	try {
		await getMessagesByChatId(chat.id).refresh();
		setMessages(await getMessagesByChatId(chat.id));

		return true;
	} catch (error: any) {
		if (error.body) {
			modalStore.error(error, 'Failed to get messages:');
		}
	}

	return false;
}
