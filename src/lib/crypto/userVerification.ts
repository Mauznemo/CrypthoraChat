import { idb } from '$lib/idb';
import { emojiVerificationStore } from '$lib/stores/emojiVerification.svelte';
import { modalStore } from '$lib/stores/modal.svelte';
import { socketStore } from '$lib/stores/socket.svelte';
import type { SafeUser } from '$lib/types';
import { regenerateAndStoreKeyPair, tryGetPublicKey, verifyPublicKeyHmac } from './keyPair';
import { getUserKeyPair, getUserPublicKey } from './keyPair.remote';
import { arrayBufferToBase64, base64ToArrayBuffer, concatArrayBuffers } from './utils';

/** Checks if we already have a verified public key for the user */
export async function isUserVerified(userId: string): Promise<boolean> {
	const user = await idb!.get('verifiedUsers', userId);
	try {
		const remotePublicKey = await getUserPublicKey(userId);
		if (remotePublicKey !== user?.publicKey) {
			await idb!.delete('verifiedUsers', userId);
			return false;
		}
	} catch (e) {
		return false;
	}
	console.log('User to verify', user);
	return user !== undefined;
}

/** Returns all unverified users in userIds */
export async function getUnverifiedUsers(userIds: string[]): Promise<string[]> {
	let verifiedUserIds: string[] = [];

	for (const userId of userIds) {
		if (!(await isUserVerified(userId))) {
			verifiedUserIds.push(userId);
		}
	}

	return verifiedUserIds;
}

export async function verifyUser(user: SafeUser, isMeRequesting: boolean): Promise<void> {
	try {
		const result = await tryGetPublicKey();

		if (!result.success) {
			return;
		}

		const userPublicKeyBase64 = await getUserPublicKey(user.id);

		const myKeyBytes = base64ToArrayBuffer(result.publicKey);
		const userKeyBytes = base64ToArrayBuffer(userPublicKeyBase64);

		const combined = isMeRequesting
			? concatArrayBuffers(myKeyBytes, userKeyBytes)
			: concatArrayBuffers(userKeyBytes, myKeyBytes);

		const hashBuffer = await crypto.subtle.digest('SHA-256', combined);

		const truncated = hashBuffer.slice(0, 16);

		const fingerprintBase64 = arrayBufferToBase64(truncated);

		if (isMeRequesting) socketStore.requestUserVerify({ userId: user.id });

		emojiVerificationStore.openDisplay(
			'Verify @' + user.username + ', make sure the emojis match',
			fingerprintBase64,
			() => {
				idb!.put('verifiedUsers', { userId: user.id, publicKey: userPublicKeyBase64 }, user.id);
				emojiVerificationStore.close();
			},
			() => {
				emojiVerificationStore.close();
			}
		);
	} catch (e) {
		modalStore.error(e, 'Failed to verify user:');
	}
}
