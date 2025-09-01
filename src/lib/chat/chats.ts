import {
	decryptChatKeySeedFromStorage,
	encryptChatKeySeedForStorage,
	getChatKeyFromSeed
} from '$lib/crypto/chat';
import { importAndSaveMasterSeed } from '$lib/crypto/master';
import { emojiKeyConverterStore } from '$lib/stores/emojiKeyConverter.svelte';
import { modalStore } from '$lib/stores/modal.svelte';
import { socketStore } from '$lib/stores/socket.svelte';
import type { ChatWithoutMessages } from '$lib/types';
import {
	getEncryptedChatKeySeed,
	getMessagesByChatId,
	saveEncryptedChatKeySeed
} from '../../routes/chat/chat.remote';
import { showMasterKeyImport } from './masterKey';
import { markReadAfterDelay, messages, resetDecryptionFailed, setMessages } from './messages';

/** Tries to select a chat and get its messages, shows an error modal if it fails */
export async function trySelectChat(
	activeChat: ChatWithoutMessages | null,
	userId: string,
	newChat: ChatWithoutMessages
): Promise<{ success: boolean; chatKey: CryptoKey | null }> {
	console.log('Chat selected (leaving previous):', activeChat?.id);
	socketStore.tryLeaveChat(activeChat);
	localStorage.setItem('lastChatId', newChat.id);

	resetDecryptionFailed();

	const chatKeySeedResult = await tryGetEncryptedChatKeySeed(newChat, userId);

	if (!chatKeySeedResult.success) {
		return { success: false, chatKey: null };
	}

	const decryptResult = await tryDecryptChatKey(chatKeySeedResult.encryptedChatKeySeed);

	if (!decryptResult.success) {
		return { success: false, chatKey: null };
	}

	const success = await tryGetMessages(newChat);

	if (success) {
		activeChat = newChat;
		console.log('Joining chat:', activeChat?.id);
		socketStore.joinChat(activeChat.id);

		markReadAfterDelay(messages, activeChat);

		return { success: true, chatKey: decryptResult.chatKey };
	} else {
		modalStore.alert('Error', 'Failed to select chat, make sure you are online.');
		return { success: false, chatKey: null };
	}
}

/** Tries to decrypt the chat key and shows an error modal if it fails */
export async function tryDecryptChatKey(
	encryptedChatKeySeed: string
): Promise<{ success: boolean; chatKey: CryptoKey | null }> {
	try {
		console.log('encrypted chat key seed:', encryptedChatKeySeed);
		const chatKeySeed = await decryptChatKeySeedFromStorage(encryptedChatKeySeed);
		console.log('chat key seed:', chatKeySeed);
		const chatKey = await getChatKeyFromSeed(chatKeySeed);
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

/** Tries to get the encrypted chat key seed for the chat and shows an error modal if it fails */
export async function tryGetEncryptedChatKeySeed(
	chat: ChatWithoutMessages,
	userId: string
): Promise<{ success: boolean; encryptedChatKeySeed: string }> {
	const encryptedChatKeySeed = await getEncryptedChatKeySeed(chat.id);

	if (!encryptedChatKeySeed) {
		modalStore.open({
			title: 'New Chat',
			content:
				'You dont have the key for ' +
				(chat.type === 'dm'
					? 'the dm with ' + chat.participants.find((p) => p.id !== userId)?.displayName
					: chat.name) +
				' yet. Please get it from ' +
				(chat.type === 'dm' ? 'them' : 'someone else in the chat who has it') +
				' in a secure way.',
			buttons: [
				{
					text: 'Enter Emoji Sequence',
					variant: 'primary',
					onClick: () => {
						emojiKeyConverterStore.openInput(
							'Enter Emoji Sequence for ' + chat.name,
							true,
							async (base64Seed) => {
								const chatKeySeedEncrypted = await encryptChatKeySeedForStorage(base64Seed);
								try {
									await saveEncryptedChatKeySeed({
										chatId: chat.id,
										encryptedKeySeed: chatKeySeedEncrypted
									});
								} catch (err: any) {
									console.error(err);
									modalStore.alert('Error', 'Failed to save chat key: ' + err.body.message);
								}
								emojiKeyConverterStore.close();
								//handleChatSelected(chat);
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
		return { success: false, encryptedChatKeySeed: '' };
	}

	return { success: true, encryptedChatKeySeed };
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
			modalStore.alert('Error', 'Failed to get messages: ' + error.body.message);
		}
	}

	return false;
}
