import { findMessageById } from '$lib/chat/messages';
import { chatStore } from '$lib/stores/chat.svelte';
import type { ClientMessage, MessageWithRelations } from '$lib/types';
import { arrayBufferToBase64, base64ToArrayBuffer } from './utils';

/** Identifies which chat, sender and key version a ciphertext was produced for. */
export interface MessageContext {
	chatId: string;
	senderId: string;
	keyVersion: number;
}

/**
 * Additional authenticated data for message encryption.
 *
 * Everyone in a chat holds the same key, so without this a member could lift another member's
 * ciphertext and re-send it verbatim as their own message - the server takes any blob, and it
 * would render under the replayer's name. Binding the chat, the sender and the key version into
 * the GCM tag makes such a message fail to decrypt instead.
 */
function messageAad(context: MessageContext): Uint8Array<ArrayBuffer> {
	return new TextEncoder().encode(`${context.chatId}:${context.senderId}:${context.keyVersion}`);
}

export async function encryptMessage(message: string, context: MessageContext): Promise<string> {
	const chatKey = chatStore.getNewestChatKey();
	if (chatKey === null) throw new Error('Chat key not found');

	const encoder = new TextEncoder();
	const data = encoder.encode(message);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv, additionalData: messageAad(context) },
		chatKey,
		data
	);
	const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(encrypted), iv.byteLength);
	return arrayBufferToBase64(combined.buffer);
}

export async function decryptMessage(data: {
	message?: ClientMessage;
	messageId?: string;
}): Promise<string> {
	const message = data.message ?? (data.messageId ? findMessageById(data.messageId) : undefined);

	const encryptedBase64 = message?.encryptedContent ?? '';
	const keyVersion = message?.usedKeyVersion ?? null;

	if (keyVersion === null || !chatStore.versionedChatKey[keyVersion])
		throw new Error('Chat key not found');

	if (!encryptedBase64) {
		return '';
	}

	try {
		const combined = new Uint8Array(base64ToArrayBuffer(encryptedBase64));
		const iv = combined.slice(0, 12);
		const encryptedData = combined.slice(12);
		const decrypted = await crypto.subtle.decrypt(
			{
				name: 'AES-GCM',
				iv,
				additionalData: messageAad({
					chatId: message!.chatId,
					senderId: message!.senderId,
					keyVersion
				})
			},
			chatStore.versionedChatKey[keyVersion],
			encryptedData.buffer
		);
		const decoder = new TextDecoder();
		return decoder.decode(decrypted);
	} catch (error) {
		console.error('Error decrypting message:', error);
		throw error;
	}
}

/**
 * The IV is random, like everywhere else in the codebase.
 *
 * It used to be SHA-256(`${userId}:${reaction}`), which reused a nonce under the chat key every
 * time the same person repeated a reaction. That is benign only for as long as the plaintext
 * stays identical too; it also made identical reactions produce byte-identical ciphertexts, so
 * the server could link "this user reacted the same way to A, B and C" without holding any key.
 *
 * The cost is that the server can no longer dedupe or match reactions by ciphertext equality, so
 * both are done client side - see handleReaction and the reaction chips in the message components.
 */
export async function encryptReaction(reaction: string, keyVersion: number): Promise<string> {
	if (!chatStore.versionedChatKey[keyVersion]) throw new Error('Chat key not found');

	const encoder = new TextEncoder();
	const data = encoder.encode(reaction);
	const iv = crypto.getRandomValues(new Uint8Array(12));

	const encrypted = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		chatStore.versionedChatKey[keyVersion],
		data
	);
	const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(encrypted), iv.byteLength);
	return arrayBufferToBase64(combined.buffer);
}

export async function decryptReaction(
	encryptedReaction: string,
	keyVersion: number
): Promise<string> {
	if (!chatStore.versionedChatKey[keyVersion])
		throw new Error('Chat key ' + keyVersion + ' not found');

	const encryptedBase64 = encryptedReaction;
	try {
		const combined = new Uint8Array(base64ToArrayBuffer(encryptedBase64));
		const iv = combined.slice(0, 12);
		const encryptedData = combined.slice(12);
		const decrypted = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv },
			chatStore.versionedChatKey[keyVersion],
			encryptedData.buffer
		);
		const decoder = new TextDecoder();
		return decoder.decode(decrypted);
	} catch (error) {
		console.error('Error decrypting reaction, base64:', encryptedBase64, 'error:', error);
		throw error;
	}
}
