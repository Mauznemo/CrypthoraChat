import { encryptChatKeyForUsers, generateChatKey } from '$lib/crypto/chat';
import { getUnverifiedUsers, verifyUser } from '$lib/crypto/userVerification';
import { encryptKeyForStorage } from '$lib/crypto/utils';
import { modalStore } from '$lib/stores/modal.svelte';
import { socketStore } from '$lib/stores/socket.svelte';
import type { ChatWithoutMessages } from '$lib/types';
import { getCurrentChatKeyVersion, saveEncryptedChatKey } from './chat.remote';
import { removeUserFromChat, rotateChatKey } from './chatOwner.remote';
import { chats } from './chats';

export const chatOwner = {
	/** Tries to rotate the chat key and shows an error modal if it fails */
	async tryRotateChatKey(chat: ChatWithoutMessages): Promise<boolean> {
		try {
			const users = chat.participants.filter((u) => u.user.id !== chat.ownerId);
			const unverifiedUserIds = await getUnverifiedUsers(users.map((u) => u.user.id));
			const unverifiedUsers = users.filter((u) => unverifiedUserIds.includes(u.user.id));

			if (unverifiedUsers.length > 0) {
				modalStore.open({
					title:
						users.length === unverifiedUsers.length
							? 'All users no longer verified'
							: 'Some users no longer verified',
					content:
						(unverifiedUsers.length === 1 ? 'User ' : 'Users ') +
						unverifiedUsers.map((u) => '@' + u.user.username).join(', ') +
						(unverifiedUsers.length === 1 ? ' is' : ' are') +
						' no longer verified. This can happen if they had to regenerate their public key. You need to re-verify with them before rotating the chat key.',
					buttons: [
						{
							text: 'Verify @' + unverifiedUsers[0].user.username,
							variant: 'primary',
							onClick: () => {
								verifyUser(unverifiedUsers[0].user, true);
							}
						}
					]
				});
				return false;
			}

			const newChatKeyVersion = await getCurrentChatKeyVersion(chat.id);
			if (newChatKeyVersion) chat.currentKeyVersion = newChatKeyVersion;

			const newKeyVersion = chat.currentKeyVersion + 1;
			console.log('Rotating chat key:', newKeyVersion);
			const newChatKey = await generateChatKey();

			const encryptedUserChatKeys = await encryptChatKeyForUsers(
				newChatKey,
				users.map((u) => u.user.id)
			);

			await rotateChatKey({
				chatId: chat.id,
				newEncryptedUserChatKeys: encryptedUserChatKeys,
				newKeyVersion
			});

			socketStore.notifyKeyRotated({ chatId: chat.id });

			const chatKeyEncrypted = await encryptKeyForStorage(newChatKey);

			try {
				await saveEncryptedChatKey({
					chatId: chat.id,
					encryptedKey: chatKeyEncrypted,
					keyVersion: newKeyVersion
				});
			} catch (err) {
				console.error(err);
				modalStore.error(err, 'Failed to save chat key:');
			}

			chats.handleKeyRotated();

			return true;
		} catch (error: any) {
			modalStore.error(error, 'Failed to rotate chat key:');
			return false;
		}
	},

	async tryRemoveUser(chatId: string, userId: string): Promise<boolean> {
		try {
			await removeUserFromChat({ chatId, userId });
			return true;
		} catch (error: any) {
			modalStore.error(error, 'Failed to remove user:');
			return false;
		}
	}
};
