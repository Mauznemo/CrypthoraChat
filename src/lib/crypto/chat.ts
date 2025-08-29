import { getMasterKey } from './master';
import { arrayBufferToBase64, base64ToArrayBuffer } from './utils';

export function generateChatKeySeed(): string {
	const seed = crypto.getRandomValues(new Uint8Array(16));
	const base64Seed = arrayBufferToBase64(seed.buffer);
	return base64Seed;
	/*return crypto.subtle.generateKey(
		{ name: 'AES-GCM', length: 256 },
		true, // Exportable for QR/sharing
		['encrypt', 'decrypt']
	);*/
}

export async function getChatKeyFromSeed(base64Seed: string): Promise<CryptoKey> {
	if (!base64Seed) {
		throw new Error('Key seed not found.');
	}
	const seedBytes = new Uint8Array(base64ToArrayBuffer(base64Seed));

	// Derive key material from seed (no salt)
	const keyMaterial = await crypto.subtle.digest('SHA-256', seedBytes);

	return crypto.subtle.importKey(
		'raw',
		keyMaterial, // Full 32 bytes for AES-256
		'AES-GCM',
		false, // Not exportable after import for security
		['encrypt', 'decrypt']
	);
}

// Encrypt chat key for DB storage
export async function encryptChatKeySeedForStorage(base64Seed: string): Promise<string> {
	const masterKey = await getMasterKey();
	const seedBuf = base64ToArrayBuffer(base64Seed);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, masterKey, seedBuf);
	const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(encrypted), iv.byteLength);
	return arrayBufferToBase64(combined.buffer);
}

// Decrypt chat key from DB
export async function decryptChatKeySeedFromStorage(encryptedSeedBase64: string): Promise<string> {
	const masterKey = await getMasterKey();
	const combined = new Uint8Array(base64ToArrayBuffer(encryptedSeedBase64));
	const iv = combined.slice(0, 12);
	const encryptedData = combined.slice(12);
	const decrypted = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv },
		masterKey,
		encryptedData.buffer
	);
	return arrayBufferToBase64(decrypted);
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
