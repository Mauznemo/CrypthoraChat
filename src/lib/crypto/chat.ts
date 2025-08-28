import { getMasterKey } from './master';

export async function generateChatKey(): Promise<CryptoKey> {
	return crypto.subtle.generateKey(
		{ name: 'AES-GCM', length: 256 },
		true, // Exportable for QR/sharing
		['encrypt', 'decrypt']
	);
}

// Encrypt chat key for DB storage
export async function encryptChatKeyForStorage(chatKey: CryptoKey): Promise<string> {
	const masterKey = await getMasterKey();
	const rawChatKey = await crypto.subtle.exportKey('raw', chatKey);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, masterKey, rawChatKey);
	const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(encrypted), iv.byteLength);
	return arrayBufferToBase64(combined.buffer);
}

// Decrypt chat key from DB
export async function decryptChatKeyFromStorage(encryptedBase64: string): Promise<CryptoKey> {
	const masterKey = await getMasterKey();
	const combined = new Uint8Array(base64ToArrayBuffer(encryptedBase64));
	const iv = combined.slice(0, 12);
	const encryptedData = combined.slice(12);
	const decrypted = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv },
		masterKey,
		encryptedData.buffer
	);
	return crypto.subtle.importKey(
		'raw',
		decrypted,
		'AES-GCM',
		true, // Exportable if needed for QR/sharing
		['encrypt', 'decrypt']
	);
}

// Export chat key to base64 for sharing (e.g., QR)
export async function getChatKeyForSharing(chatKey: CryptoKey): Promise<string> {
	const exported = await crypto.subtle.exportKey('raw', chatKey);
	return arrayBufferToBase64(exported);
}

// Import chat key from shared base64 (after scanning QR)
export async function importChatKeyFromSharing(base64Key: string): Promise<CryptoKey> {
	const rawKey = base64ToArrayBuffer(base64Key);
	return crypto.subtle.importKey(
		'raw',
		rawKey,
		'AES-GCM',
		true, // Exportable if needed later
		['encrypt', 'decrypt']
	);
}
