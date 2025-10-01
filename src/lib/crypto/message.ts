import { findMessageById } from '$lib/chat/messages';
import { chatStore } from '$lib/stores/chat.svelte';
import type { ClientMessage, MessageWithRelations } from '$lib/types';
import { arrayBufferToBase64, base64ToArrayBuffer } from './utils';

export async function encryptMessage(message: string): Promise<string> {
	const chatKey = chatStore.getNewestChatKey();
	if (chatKey === null) throw new Error('Chat key not found');

	const encoder = new TextEncoder();
	const data = encoder.encode(message);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chatKey, data);
	const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(encrypted), iv.byteLength);
	return arrayBufferToBase64(combined.buffer);
}

export async function decryptMessage(data: {
	message?: ClientMessage;
	messageId?: string;
}): Promise<string> {
	let encryptedBase64: string = '';
	let keyVersion: number | null = null;

	if (data.message) {
		encryptedBase64 = data.message.encryptedContent;
		keyVersion = data.message.usedKeyVersion;
	} else if (data.messageId) {
		const m = findMessageById(data.messageId);

		encryptedBase64 = m?.encryptedContent || '';
		keyVersion = m?.usedKeyVersion || null;
	}
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
			{ name: 'AES-GCM', iv },
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

export async function encryptReaction(
	reaction: string,
	userId: string,
	keyVersion: number
): Promise<string> {
	if (!chatStore.versionedChatKey[keyVersion]) throw new Error('Chat key not found');

	const encoder = new TextEncoder();
	const data = encoder.encode(reaction);

	// Deterministic IV from reaction + userId
	const seedData = encoder.encode(`${userId}:${reaction}`);
	const hashBuffer = await crypto.subtle.digest('SHA-256', seedData);
	const iv = new Uint8Array(hashBuffer.slice(0, 12));

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
