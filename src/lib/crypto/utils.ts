import { getMasterKey } from './master';

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

//** Encrypts key for DB storage */
export async function encryptKeyForStorage(
	key: CryptoKey,
	keyType: 'symmetric' | 'public' | 'private' = 'symmetric'
): Promise<string> {
	const masterKey = await getMasterKey();

	// choose correct format
	let format: KeyFormat;
	switch (keyType) {
		case 'public':
			format = 'spki';
			break;
		case 'private':
			format = 'pkcs8';
			break;
		default:
			format = 'raw';
	}

	const rawKey = await crypto.subtle.exportKey(format, key);

	// encrypt with master AES key
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, masterKey, rawKey);

	// prepend IV
	const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(encrypted), iv.byteLength);

	return arrayBufferToBase64(combined.buffer);
}

//** Decrypts key from DB */
export async function decryptKeyFromStorage(
	encryptedBase64: string,
	keyType: 'symmetric' | 'public' | 'private' = 'symmetric'
): Promise<CryptoKey> {
	const masterKey = await getMasterKey();

	// split IV + ciphertext
	const combined = new Uint8Array(base64ToArrayBuffer(encryptedBase64));
	const iv = combined.slice(0, 12);
	const encryptedData = combined.slice(12);

	// decrypt
	const decrypted = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv },
		masterKey,
		encryptedData.buffer
	);

	// choose correct format + import params
	if (keyType === 'symmetric') {
		return crypto.subtle.importKey('raw', decrypted, 'AES-GCM', true, ['encrypt', 'decrypt']);
	}

	if (keyType === 'public') {
		return crypto.subtle.importKey('spki', decrypted, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, [
			'encrypt'
		]);
	}

	// private
	return crypto.subtle.importKey('pkcs8', decrypted, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, [
		'decrypt'
	]);
}

//** Concatenates two array buffers */
export function concatArrayBuffers(a: ArrayBuffer, b: ArrayBuffer): ArrayBuffer {
	const tmp = new Uint8Array(a.byteLength + b.byteLength);
	tmp.set(new Uint8Array(a), 0);
	tmp.set(new Uint8Array(b), a.byteLength);
	return tmp.buffer;
}
