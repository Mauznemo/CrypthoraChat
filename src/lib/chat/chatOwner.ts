import { encryptChatKeyForUsers, generateChatKey } from '$lib/crypto/chat';
import { ensureUsersVerified } from '$lib/crypto/userVerification';
import { encryptKeyForStorage } from '$lib/crypto/utils';
import { modalStore } from '$lib/stores/modal.svelte';
import type { ChatWithoutMessages } from '$lib/types';
import { t } from 'svelte-i18n';
import { saveEncryptedChatKey } from './chat.remote';
import { removeUserFromChat, rotateChatKey } from './chatOwner.remote';
import { chats } from './chats';
import { get } from 'svelte/store';
import { toastStore } from '$lib/stores/toast.svelte';

export const chatOwner = {
	/** Tries to rotate the chat key and shows an error modal if it fails */
	async tryRotateChatKey(chat: ChatWithoutMessages): Promise<boolean> {
		try {
			const others = chat.participants.filter((u) => u.user.id !== chat.ownerId);

			// You never verify yourself, so only the other members gate the rotation.
			const verified = await ensureUsersVerified(
				others.map((u) => u.user),
				{
					titleFor: (unverifiedCount, totalCount) =>
						unverifiedCount === totalCount
							? get(t)('chat.chat-owner.all-no-longer-verified')
							: get(t)('chat.chat-owner.some-no-longer-verified'),
					contentForOne: (username) =>
						get(t)('chat.chat-owner.user-no-longer-verified', { values: { username } }),
					contentForMany: (usernames) =>
						get(t)('chat.chat-owner.users-no-longer-verified', { values: { usernames } })
				}
			);

			if (!verified) return false;

			console.log('Rotating chat key for:', chat.id);
			const newChatKey = await generateChatKey();

			// Includes the owner: without their own PublicUserChatKey row, the owner's other
			// tabs and devices have no way to recover the new key after a rotation.
			const encryptedUserChatKeys = await encryptChatKeyForUsers(
				newChatKey,
				chat.participants.map((u) => u.user.id)
			);

			// The version is assigned by the server, which knows the current one.
			const { newKeyVersion } = await rotateChatKey({
				chatId: chat.id,
				newEncryptedUserChatKeys: encryptedUserChatKeys
			});

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

			chats.applyOwnRotation(chat.id, newKeyVersion, newChatKey);

			return true;
		} catch (error: any) {
			modalStore.error(error, get(t)('chat.chat-owner.failed-to-rotate-chat-key'));
			return false;
		}
	},

	async tryRemoveUser(chatId: string, userId: string): Promise<boolean> {
		try {
			await removeUserFromChat({ chatId, userId });
			toastStore.success(get(t)('chat.chat-owner.user-removed'));
			return true;
		} catch (error: any) {
			modalStore.error(error, get(t)('chat.chat-owner.failed-to-remove-user'));
			return false;
		}
	}
};
