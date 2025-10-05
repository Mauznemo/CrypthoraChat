import { showMasterKeyImport } from '$lib/chat/masterKey';
import { modalStore } from '$lib/stores/modal.svelte';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { createUserKeyPair, getUserKeyPair, updateUserKeyPair } from './keyPair.remote';
import { getHmacKey } from './master';
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

		const publicKeyHmac = await hmacPublicKey(publicKeyBase64);

		await createUserKeyPair({
			encryptedPrivateKeyBase64: encryptedPrivateKeyBase64,
			publicKeyBase64: publicKeyBase64,
			publicKeyHmac
		});
	} catch (e: any) {
		console.error(e);
		throw new Error(e.body?.message || e);
	}
	console.log('Key pair stored');
}

/** Regenerates RSA key pair and stores it encrypted on the db */
export async function regenerateAndStoreKeyPair(): Promise<void> {
	try {
		console.log('Regenerating key pair...');
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
		console.log('New Key pair generated');

		const publicKeyBase64 = await exportPublicKeyBase64(keyPair.publicKey);
		const encryptedPrivateKeyBase64 = await encryptKeyForStorage(keyPair.privateKey, 'private');

		console.log('Public Key Base64:', publicKeyBase64);
		console.log('Encrypted Private Key Base64:', encryptedPrivateKeyBase64);

		const publicKeyHmac = await hmacPublicKey(publicKeyBase64);

		await updateUserKeyPair({
			encryptedPrivateKeyBase64: encryptedPrivateKeyBase64,
			publicKeyBase64: publicKeyBase64,
			publicKeyHmac
		});
	} catch (e: any) {
		console.error(e);
		throw new Error(e.body?.message || e);
	}
	modalStore.alert(get(t)('common.success'), get(t)('chat.key-pair.re-generate-key-pair-success'));
	console.log('New Key pair stored');
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

/** Checks if the user's public key is valid, shows an error modal if not */
export async function checkPublicKey(): Promise<boolean> {
	const result = await tryGetPublicKey();
	return result.success;
}

/** Tries to get the user's public key, shows an error modal if it fails */
export async function tryGetPublicKey(): Promise<{ success: boolean; publicKey: string }> {
	try {
		const myKeyPair = await getUserKeyPair();
		const myPublicKeyBase64 = myKeyPair.publicKey;

		const isValid = await verifyPublicKeyHmac(myPublicKeyBase64, myKeyPair.publicKeyHmac);
		if (!isValid) {
			modalStore.open({
				title: get(t)('common.error'),
				content: get(t)('chat.key-pair.public-key-integrity-error'),
				buttons: [
					{
						text: get(t)('chat.key-pair.re-import-master-key'),
						variant: 'primary',
						onClick: () => {
							showMasterKeyImport();
						}
					},
					{
						text: get(t)('chat.key-pair.re-generate-key-pair'),
						variant: 'danger',
						onClick: () => {
							modalStore.confirm(
								get(t)('common.are-you-sure'),
								get(t)('chat.key-pair.re-generate-key-pair-confirm'),
								() => {
									regenerateAndStoreKeyPair();
								}
							);
						}
					}
				],
				id: 'public-key-integrity-error'
			});
			return { success: false, publicKey: '' };
		}
		return { success: true, publicKey: myKeyPair.publicKey };
	} catch (e) {
		modalStore.error(e, get(t)('chat.key-pair.failed-to-get-public-key'));
		return { success: false, publicKey: '' };
	}
}

export async function hmacPublicKey(publicKeyBase64: string): Promise<string> {
	const masterKey = await getHmacKey();
	const publicKeyBytes = base64ToArrayBuffer(publicKeyBase64);

	const signature = await crypto.subtle.sign('HMAC', masterKey, publicKeyBytes);

	return arrayBufferToBase64(signature); // store alongside public key in DB
}

export async function verifyPublicKeyHmac(
	publicKeyBase64: string,
	hmacBase64: string
): Promise<boolean> {
	try {
		const masterKey = await getHmacKey();
		const publicKeyBytes = base64ToArrayBuffer(publicKeyBase64);
		const hmacBytes = base64ToArrayBuffer(hmacBase64);

		return crypto.subtle.verify('HMAC', masterKey, hmacBytes, publicKeyBytes);
	} catch (e) {
		return false;
	}
}
