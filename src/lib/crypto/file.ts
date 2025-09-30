import { chatStore } from '$lib/stores/chat.svelte';
import { getMasterKey } from './master';
import { arrayBufferToBase64, base64ToArrayBuffer } from './utils';

export async function encryptFile(
	file: File,
	keyToUse: 'master' | 'chat' = 'chat'
): Promise<{ encryptedData: Blob; encryptedFileNameSafeBase64: string }> {
	let key: CryptoKey | null = null;
	if (keyToUse === 'master') key = await getMasterKey();
	else if (keyToUse === 'chat') key = chatStore.getNewestChatKey();
	if (key === null) throw new Error('Key not found (' + keyToUse + ')');

	const fileBuffer = await file.arrayBuffer();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, fileBuffer);

	const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(encrypted), iv.byteLength);

	const encryptedFileNameBase64 = await encryptFileName(file.name, keyToUse);
	const encryptedFileNameSafeBase64 = base64UrlEncode(encryptedFileNameBase64);

	return {
		encryptedData: new Blob([combined]),
		encryptedFileNameSafeBase64: encryptedFileNameSafeBase64
	};
}

export async function decryptFile(
	encryptedData: ArrayBuffer,
	keyVersion: number,
	keyToUse: 'master' | 'chat' = 'chat'
): Promise<Blob> {
	let key: CryptoKey | null = null;
	if (keyToUse === 'master') key = await getMasterKey();
	else if (keyToUse === 'chat') key = chatStore.versionedChatKey[keyVersion];
	if (key === null) throw new Error('Key not found (' + keyToUse + ')');

	const iv = encryptedData.slice(0, 12);
	const encryptedBuffer = encryptedData.slice(12);

	const decryptedBuffer = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv },
		key,
		encryptedBuffer
	);

	return new Blob([decryptedBuffer]);
}

async function encryptFileName(
	fileName: string,
	keyToUse: 'master' | 'chat' = 'chat'
): Promise<string> {
	let key: CryptoKey | null = null;
	if (keyToUse === 'master') key = await getMasterKey();
	else if (keyToUse === 'chat') key = chatStore.getNewestChatKey();
	if (key === null) throw new Error('Key not found (' + keyToUse + ')');

	const encoder = new TextEncoder();
	const data = encoder.encode(fileName);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
	const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(encrypted), iv.byteLength);
	return arrayBufferToBase64(combined.buffer);
}

export async function decryptFileName(
	encryptedFileNameSafeBase64: string,
	keyVersion: number,
	keyToUse: 'master' | 'chat' = 'chat'
): Promise<string> {
	let key: CryptoKey | null = null;
	if (keyToUse === 'master') key = await getMasterKey();
	else if (keyToUse === 'chat') key = chatStore.versionedChatKey[keyVersion];
	if (key === null) throw new Error('Key not found (' + keyToUse + ')');

	const encryptedBase64 = await base64UrlDecode(encryptedFileNameSafeBase64);
	try {
		const combined = new Uint8Array(base64ToArrayBuffer(encryptedBase64));
		const iv = combined.slice(0, 12);
		const encryptedData = combined.slice(12);
		const decrypted = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv },
			key,
			encryptedData.buffer
		);
		const decoder = new TextDecoder();
		return decoder.decode(decrypted);
	} catch (error) {
		console.error('Error decrypting file name:', error);
		throw error;
	}
}

function base64UrlEncode(base64: string): string {
	return base64.replace(/\+/g, '-').replace(/\//g, '~').replace(/=+$/, '');
}

function base64UrlDecode(base64url: string): string {
	let base64 = base64url.replace(/-/g, '+').replace(/~/g, '/');
	while (base64.length % 4) base64 += '=';
	return base64;
}
