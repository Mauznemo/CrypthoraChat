import { idb } from '$lib/idb';
import { emojiVerificationStore } from '$lib/stores/emojiVerification.svelte';
import { modalStore } from '$lib/stores/modal.svelte';
import {
	socketStore,
	type VerifyRequestStatus,
	type VerifyResponse
} from '$lib/stores/socket.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import { verificationStore, type IncomingVerifyRequest } from '$lib/stores/verification.svelte';
import type { SafeUser } from '$lib/types';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { tryGetPublicKey } from './keyPair';
import { getUserPublicKey } from './keyPair.remote';
import { arrayBufferToBase64, base64ToArrayBuffer, concatArrayBuffers } from './utils';

/** How long to wait for the peer to accept or decline before giving up */
const RESPONSE_TIMEOUT_MS = 60_000;

/**
 * Copy overrides for the "you need to verify first" prompt. These take the counts
 * because only ensureUsersVerified knows how many of the users are actually unverified.
 */
export type VerifyPromptMessages = {
	titleFor?: (unverifiedCount: number, totalCount: number) => string;
	contentForOne?: (username: string) => string;
	contentForMany?: (usernames: string) => string;
};

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

/**
 * Runs one verification with `user` and resolves once it is settled.
 *
 * As the requester this first negotiates with the peer (are they reachable, do they
 * accept) so the emoji dialog is only shown when there is somebody on the other side.
 * As the responder it goes straight to the comparison.
 */
export async function verifyUser(
	user: SafeUser,
	isMeRequesting: boolean,
	incoming?: IncomingVerifyRequest
): Promise<boolean> {
	try {
		const result = await tryGetPublicKey();

		if (!result.success) {
			verificationStore.reset();
			return false;
		}

		const userPublicKeyBase64 = await getUserPublicKey(user.id);

		const myKeyBytes = base64ToArrayBuffer(result.publicKey);
		const userKeyBytes = base64ToArrayBuffer(userPublicKeyBase64);

		// Both sides must hash the keys in the same order to see the same emojis.
		const combined = isMeRequesting
			? concatArrayBuffers(myKeyBytes, userKeyBytes)
			: concatArrayBuffers(userKeyBytes, myKeyBytes);

		const hashBuffer = await crypto.subtle.digest('SHA-256', combined);

		const truncated = hashBuffer.slice(0, 16);

		const fingerprintBase64 = arrayBufferToBase64(truncated);

		let requestId = incoming?.requestId;

		if (isMeRequesting) {
			const accepted = await requestPeerAcceptance(user);
			if (!accepted) {
				verificationStore.reset();
				return false;
			}
			requestId = verificationStore.requestId ?? undefined;
		}

		verificationStore.peer = user;
		verificationStore.setStatus('comparing');

		const matched = await showEmojiDialog(user, fingerprintBase64);

		if (matched) {
			await idb!.put('verifiedUsers', { userId: user.id, publicKey: userPublicKeyBase64 }, user.id);
		}

		// Let the other side know how it went, so a mismatch is visible to both.
		if (requestId) {
			socketStore.respondUserVerify({
				requestId,
				toUserId: user.id,
				response: matched ? 'matched' : 'failed'
			});
		}

		verificationStore.reset();
		return matched;
	} catch (e) {
		verificationStore.reset();
		modalStore.error(e, get(t)('chat.emoji-verification.failed-to-verify-user'));
		return false;
	}
}

/**
 * Makes sure every user is verified, prompting and running the verifications if not.
 *
 * Returns true only when the caller may proceed, which is what lets "Start Chat" carry
 * on by itself instead of dropping the user back on the form to press it again.
 */
export async function ensureUsersVerified(
	users: SafeUser[],
	messages?: VerifyPromptMessages
): Promise<boolean> {
	const unverifiedIds = await getUnverifiedUsers(users.map((u) => u.id));
	if (unverifiedIds.length === 0) return true;

	const unverified = users.filter((u) => unverifiedIds.includes(u.id));

	if (!(await confirmVerifyPrompt(unverified, users.length, messages))) return false;

	try {
		for (const [index, user] of unverified.entries()) {
			// The emoji dialog is single-slot, so these have to run one at a time anyway.
			verificationStore.progress =
				unverified.length > 1 ? { current: index + 1, total: unverified.length } : null;

			if (!(await verifyUser(user, true))) return false;

			toastStore.success(
				get(t)('chat.verification.success', { values: { username: user.username } })
			);
		}
		return true;
	} finally {
		verificationStore.resetAll();
	}
}

/** One prompt covering every unverified user, rather than one press per user */
function confirmVerifyPrompt(
	unverified: SafeUser[],
	totalCount: number,
	messages?: VerifyPromptMessages
): Promise<boolean> {
	return new Promise((resolve) => {
		let confirmed = false;
		const usernames = unverified.map((u) => '@' + u.username).join(', ');

		const content =
			unverified.length === 1
				? (messages?.contentForOne?.(unverified[0].username) ??
					get(t)('chat.new.dm.not-verified-content', {
						values: { username: unverified[0].username }
					}))
				: (messages?.contentForMany?.(usernames) ??
					get(t)('chat.new.group.not-verified-content', { values: { usernames } }));

		const title =
			messages?.titleFor?.(unverified.length, totalCount) ??
			(unverified.length === 1
				? get(t)('chat.new.dm.not-verified')
				: unverified.length === totalCount
					? get(t)('chat.new.group.all-not-verified')
					: get(t)('chat.new.group.some-not-verified'));

		modalStore.open({
			title,
			content: content + '\n\n' + get(t)('chat.verification.continue-after-verify'),
			buttons: [
				{
					text:
						unverified.length === 1
							? get(t)('chat.new.group.verify-user', {
									values: { username: unverified[0].username }
								})
							: get(t)('chat.verification.verify-all', {
									values: { count: unverified.length }
								}),
					variant: 'primary',
					onClick: () => {
						confirmed = true;
					}
				},
				{ text: get(t)('common.cancel'), variant: 'secondary' }
			],
			// onClose fires on every close path, including the buttons above, so this
			// resolves exactly once no matter how the modal goes away.
			onClose: () => resolve(confirmed)
		});
	});
}

function showEmojiDialog(user: SafeUser, fingerprintBase64: string): Promise<boolean> {
	return new Promise((resolve) => {
		emojiVerificationStore.openDisplay(
			get(t)('chat.emoji-verification.verify-user', { values: { username: user.username } }),
			fingerprintBase64,
			resolve
		);
	});
}

/** Sends the request and waits for the peer to accept, reporting why not if they don't */
async function requestPeerAcceptance(user: SafeUser): Promise<boolean> {
	const requestId = verificationStore.beginOutgoing(user);

	// Loops so "peer offline" can be retried without restarting the whole flow.
	while (true) {
		verificationStore.setStatus('requesting');

		let status: VerifyRequestStatus;
		try {
			const ack = await socketStore.requestUserVerify({ requestId, userId: user.id });
			status = ack.status;
		} catch (e) {
			// No ack in time: treat the peer as unreachable rather than waiting forever.
			console.error('Verification request was not acknowledged:', e);
			status = 'offline';
		}

		if (status === 'offline' || status === 'rate-limited') {
			verificationStore.setStatus(status === 'offline' ? 'peer-offline' : 'rate-limited');
			if ((await waitForUserAction()) === 'cancel') return false;
			continue;
		}

		verificationStore.setStatus(status === 'background' ? 'peer-background' : 'waiting');

		const response = await waitForPeerResponse(requestId, user.id);

		if (response === 'accepted') return true;
		if (response === 'cancel') return false;

		if (response === 'declined') verificationStore.setStatus('declined');
		else if (response === 'busy') verificationStore.setStatus('peer-busy');
		else verificationStore.setStatus('timeout');

		// Wait for acknowledgement so the reason is actually read.
		await waitForUserAction();
		return false;
	}
}

/** Resolves when the status UI reports the user's choice */
function waitForUserAction(): Promise<'retry' | 'cancel'> {
	return new Promise((resolve) => {
		verificationStore.respond = (action) => {
			verificationStore.respond = undefined;
			resolve(action);
		};
	});
}

type PeerResponse = VerifyResponse | 'timeout' | 'cancel';

function waitForPeerResponse(requestId: string, peerId: string): Promise<PeerResponse> {
	return new Promise((resolve) => {
		let settled = false;

		const finish = (value: PeerResponse) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			unsubscribe();
			verificationStore.respond = undefined;
			resolve(value);
		};

		const timer = setTimeout(() => {
			socketStore.cancelUserVerify({ requestId, userId: peerId });
			finish('timeout');
		}, RESPONSE_TIMEOUT_MS);

		const unsubscribe = socketStore.onUserVerifyResponse((data) => {
			if (data.requestId !== requestId) return;
			finish(data.response);
		});

		verificationStore.respond = (action) => {
			if (action !== 'cancel') return;
			socketStore.cancelUserVerify({ requestId, userId: peerId });
			finish('cancel');
		};
	});
}
