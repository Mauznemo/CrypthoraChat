import { encryptChatKeyForUsers, generateChatKey } from '$lib/crypto/chat';
import { getUnverifiedUsers, verifyUser } from '$lib/crypto/userVerification';
import { encryptKeyForStorage } from '$lib/crypto/utils';
import { modalStore } from '$lib/stores/modal.svelte';
import { socketStore } from '$lib/stores/socket.svelte';
import type { ChatWithoutMessages } from '$lib/types';
import { t } from 'svelte-i18n';
import { getCurrentChatKeyVersion, saveEncryptedChatKey } from './chat.remote';
import { removeUserFromChat, rotateChatKey } from './chatOwner.remote';
import { chats } from './chats';
import { get } from 'svelte/store';

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
							? get(t)('chat.chat-owner.all-no-longer-verified')
							: get(t)('chat.chat-owner.some-no-longer-verified'),
					content:
						unverifiedUsers.length === 1
							? get(t)('chat.chat-owner.user-no-longer-verified', {
									values: { username: unverifiedUsers[0].user.username }
								})
							: get(t)('chat.chat-owner.users-no-longer-verified', {
									values: {
										usernames: unverifiedUsers.map((u) => '@' + u.user.username).join(', ')
									}
								}),
					buttons: [
						{
							text: get(t)('chat.new.group.verify-user', {
								values: { username: unverifiedUsers[0].user.username }
							}),
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
				modalStore.error(err, get(t)('chat.chat-owner.failed-to-save-chat-key'));
			}

			chats.handleKeyRotated();

			return true;
		} catch (error: any) {
			modalStore.error(error, get(t)('chat.chat-owner.failed-to-rotate-chat-key'));
			return false;
		}
	},

	async tryRemoveUser(chatId: string, userId: string): Promise<boolean> {
		try {
			await removeUserFromChat({ chatId, userId });
			return true;
		} catch (error: any) {
			modalStore.error(error, get(t)('chat.chat-owner.failed-to-remove-user'));
			return false;
		}
	}
};
