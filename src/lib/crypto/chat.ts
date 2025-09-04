import { encryptKeyWithRSA, importPublicKeyBase64 } from './keyPair';
import { getUserPublicKey } from './keyPair.remote';
import { arrayBufferToBase64, base64ToArrayBuffer } from './utils';

export async function generateChatKey(): Promise<CryptoKey> {
	return crypto.subtle.generateKey(
		{ name: 'AES-GCM', length: 256 },
		true, // Exportable for sharing
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

//** Uses the users public key to encrypt the chat key for them */
export async function encryptChatKeyForUser(chatKey: CryptoKey, userId: string): Promise<string> {
	const userPublicKeyBase64 = await getUserPublicKey(userId);
	const userPublicKey = await importPublicKeyBase64(userPublicKeyBase64);
	const encryptedChatKey = await encryptKeyWithRSA(chatKey, userPublicKey);
	return encryptedChatKey;
}
