import { createUserKeyPair, getUserKeyPair } from './keyPair.remote';
import {
	arrayBufferToBase64,
	base64ToArrayBuffer,
	decryptKeyFromStorage,
	encryptKeyForStorage
} from './utils';

export interface KeyPairResult {
	privateKey: CryptoKey;
	publicKey: CryptoKey;
	publicKeyBase64: string; // For sharing/storing
}

export interface EncryptedKey {
	encryptedData: ArrayBuffer;
	iv?: Uint8Array; // Only for AES-GCM approach
}

/** Generates RSA key pair and stores it encrypted on the db */
export async function generateAndStoreKeyPair(): Promise<void> {
	try {
		console.log('Generating key pair...');
		const keyPair = await crypto.subtle.generateKey(
			{
				name: 'RSA-OAEP',
				modulusLength: 2048, // or 4096 for higher security
				publicExponent: new Uint8Array([1, 0, 1]),
				hash: 'SHA-256'
			},
			true, // extractable
			['encrypt', 'decrypt']
		);
		console.log('Key pair generated');

		const publicKeyBase64 = await exportPublicKeyBase64(keyPair.publicKey);
		const encryptedPrivateKeyBase64 = await encryptKeyForStorage(keyPair.privateKey, 'private');

		console.log('Public Key Base64:', publicKeyBase64);
		console.log('Encrypted Private Key Base64:', encryptedPrivateKeyBase64);

		await createUserKeyPair({
			encryptedPrivateKeyBase64: encryptedPrivateKeyBase64,
			publicKeyBase64: publicKeyBase64
		});
	} catch (e: any) {
		console.error(e);
		throw new Error(e.body?.message || e);
	}
	console.log('Key pair stored');
}

export async function getPrivateKey(): Promise<CryptoKey> {
	const keyPair = await getUserKeyPair();
	const privateKey = await decryptKeyFromStorage(keyPair.encryptedPrivateKey, 'private');
	return privateKey;
}

/** Encrypt AES key with recipient's public key */
export async function encryptKeyWithRSA(
	key: CryptoKey,
	recipientPublicKey: CryptoKey
): Promise<string> {
	// Export AES key as raw bytes
	const aesKeyBytes = await crypto.subtle.exportKey('raw', key);

	// Encrypt with RSA public key
	const encryptedData = await crypto.subtle.encrypt(
		{ name: 'RSA-OAEP' },
		recipientPublicKey,
		aesKeyBytes
	);

	return arrayBufferToBase64(encryptedData);
}

/** Decrypt AES key with your private key */
export async function decryptKeyWithRSA(
	encryptedKeyBase64: string,
	privateKey: CryptoKey
): Promise<CryptoKey> {
	const encryptedKey: ArrayBuffer = base64ToArrayBuffer(encryptedKeyBase64);

	// Decrypt with RSA private key
	const decryptedKeyBytes = await crypto.subtle.decrypt(
		{ name: 'RSA-OAEP' },
		privateKey,
		encryptedKey
	);

	// Import back as AES key
	return await crypto.subtle.importKey('raw', decryptedKeyBytes, { name: 'AES-GCM' }, true, [
		'encrypt',
		'decrypt'
	]);
}

/** Export public key */
export async function exportPublicKeyBase64(publicKey: CryptoKey): Promise<string> {
	const exported = await crypto.subtle.exportKey('spki', publicKey);
	const exportedAsBase64 = arrayBufferToBase64(exported);

	return exportedAsBase64;
}

/** Import public key */
export async function importPublicKeyBase64(base64Key: string): Promise<CryptoKey> {
	const importedKey = await crypto.subtle.importKey(
		'spki',
		base64ToArrayBuffer(base64Key),
		{ name: 'RSA-OAEP', hash: 'SHA-256' }, // algorithm must match
		true,
		['encrypt']
	);

	return importedKey;
}

// export async function encryptKeyPairForStorage(
// 	keyPair: KeyPairResult
// ): Promise<{ encryptedPrivateKeyBase64: string; encryptedPublicKeyBase64: string }> {
// 	const encryptedPrivateKey = await encryptKeyForStorage(keyPair.privateKey);
// 	const encryptedPublicKey = await encryptKeyForStorage(keyPair.publicKey);
// 	return {
// 		encryptedPrivateKeyBase64: encryptedPrivateKey,
// 		encryptedPublicKeyBase64: encryptedPublicKey
// 	};
// }

// export async function decryptKeyPairFromStorage(
// 	encryptedPrivateKeyBase64: string,
// 	encryptedPublicKeyBase64: string
// ): Promise<KeyPairResult> {
// 	const privateKey = await decryptKeyFromStorage(encryptedPrivateKeyBase64);
// 	const publicKey = await decryptKeyFromStorage(encryptedPublicKeyBase64);
// 	return {
// 		privateKey,
// 		publicKey,
// 		publicKeyBase64: await exportPublicKeyBase64(publicKey)
// 	};
// }

// /**
//  * Example usage for RSA approach
//  */
// export async function exampleRSAUsage() {
// 	// User A generates key pair
// 	const userAKeys = await generateRSAKeyPair();

// 	// User B generates key pair
// 	const userBKeys = await generateRSAKeyPair();

// 	// Users exchange public keys (via your server/protocol)
// 	// User A wants to share their AES chat key with User B

// 	// Generate or get existing AES key for chat
// 	const chatKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
// 		'encrypt',
// 		'decrypt'
// 	]);

// 	// User A encrypts chat key with User B's public key
// 	const encryptedKeyForB = await encryptKeyWithRSA(chatKey, userBKeys.publicKey);

// 	// Send encryptedKeyForB to User B
// 	// User B decrypts to get the chat key
// 	const decryptedChatKey = await decryptKeyWithRSA(encryptedKeyForB, userBKeys.privateKey);

// 	console.log(
// 		'Keys match:',
// 		(await crypto.subtle.exportKey('raw', chatKey)) ===
// 			(await crypto.subtle.exportKey('raw', decryptedChatKey))
// 	);
// }
