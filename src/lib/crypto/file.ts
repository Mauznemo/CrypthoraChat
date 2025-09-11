import { chatStore } from '$lib/stores/chat.svelte';
import { arrayBufferToBase64 } from './utils';

export async function encryptFile(
	file: File
): Promise<{ encryptedData: Blob; encryptedFileNameSafeBase64: string }> {
	const chatKey = chatStore.getNewestChatKey();
	if (chatKey === null) throw new Error('Chat key not found');

	const fileBuffer = await file.arrayBuffer();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chatKey, fileBuffer);

	const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(encrypted), iv.byteLength);

	const encryptedFileNameBase64 = await encryptFileName(file.name);
	const encryptedFileNameSafeBase64 = base64UrlEncode(encryptedFileNameBase64);

	return {
		encryptedData: new Blob([combined]),
		encryptedFileNameSafeBase64: encryptedFileNameSafeBase64
	};
}

async function encryptFileName(fileName: string): Promise<string> {
	const chatKey = chatStore.getNewestChatKey();
	if (chatKey === null) throw new Error('Chat key not found');

	const encoder = new TextEncoder();
	const data = encoder.encode(fileName);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chatKey, data);
	const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(encrypted), iv.byteLength);
	return arrayBufferToBase64(combined.buffer);
}

function base64UrlEncode(base64: string): string {
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(base64url: string): Uint8Array {
	let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
	while (base64.length % 4) base64 += '=';
	return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
