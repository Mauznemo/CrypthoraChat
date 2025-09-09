import { chatStore } from '$lib/stores/chat.svelte';
import { arrayBufferToBase64 } from './utils';

export async function encryptFile(
	file: File
): Promise<{ encryptedData: Blob; encryptedFileNameBase64: string }> {
	const chatKey = chatStore.getNewestChatKey();
	if (chatKey === null) throw new Error('Chat key not found');

	const fileBuffer = await file.arrayBuffer();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chatKey, fileBuffer);

	const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(encrypted), iv.byteLength);

	const encryptedFileNameBase64 = await encryptFileName(file.name);

	return {
		encryptedData: new Blob([combined]),
		encryptedFileNameBase64: encryptedFileNameBase64
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
