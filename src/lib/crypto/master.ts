import { idb } from '$lib/idb';
import { arrayBufferToBase64, base64ToArrayBuffer } from './utils';

/** Generate and store master seed */
export async function generateAndStoreMasterKey(): Promise<void> {
	const seed = crypto.getRandomValues(new Uint8Array(16));
	const base64Seed = arrayBufferToBase64(seed.buffer);
	idb!.put('master', base64Seed, 'master');
}

/**
 * HKDF salt. Constant on purpose: the seed is already 128 uniformly random bits, so the salt is
 * only here to domain-separate this app's derivation from any other use of the same seed.
 */
const HKDF_SALT = new TextEncoder().encode('crypthora:v1');

/**
 * Derives a purpose-specific key from the master seed.
 *
 * The AES key and the HMAC key used to be the same SHA-256(seed) bytes imported under two
 * different algorithms. Using one key with two primitives has no known break for this particular
 * AES-GCM/HMAC pairing, but it removes a layer of safety for nothing - HKDF with distinct `info`
 * labels costs the same and keeps the two independent.
 */
async function deriveKey(
	info: string,
	algorithm: AesKeyGenParams | HmacImportParams,
	usages: KeyUsage[]
): Promise<CryptoKey> {
	const base64Seed = await idb!.get('master', 'master');
	if (!base64Seed) {
		throw new Error('Master seed not found. Generate or import it first.');
	}
	const seedBytes = new Uint8Array(base64ToArrayBuffer(base64Seed));

	const seedKey = await crypto.subtle.importKey('raw', seedBytes, 'HKDF', false, ['deriveKey']);

	return crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: HKDF_SALT,
			info: new TextEncoder().encode(info)
		},
		seedKey,
		algorithm,
		false,
		usages
	);
}

/** Retrieve and derive master key from stored seed */
export async function getMasterKey(): Promise<CryptoKey> {
	return deriveKey('crypthora:aes', { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']);
}

export async function getHmacKey(): Promise<CryptoKey> {
	return deriveKey('crypthora:hmac', { name: 'HMAC', hash: 'SHA-256', length: 256 }, [
		'sign',
		'verify'
	]);
}

export async function hasMasterKey(): Promise<boolean> {
	return !!(await idb!.get('master', 'master'));
}

/** Get master key base64 for sharing */
export async function getMasterSeedForSharing(): Promise<string> {
	const base64Seed = await idb!.get('master', 'master');
	if (!base64Seed) {
		throw new Error('Master seed not found. Generate it first.');
	}
	return base64Seed;
}

/** Import and save master key from shared base64 */
export async function importAndSaveMasterSeed(masterSeedBase64: string): Promise<void> {
	try {
		const rawBuffer = base64ToArrayBuffer(masterSeedBase64);
		const rawBytes = new Uint8Array(rawBuffer);

		if (rawBytes.length !== 16) {
			throw new Error('Invalid master seed length. Must be exactly 16 bytes.');
		}

		idb!.put('master', masterSeedBase64, 'master');
	} catch (error) {
		throw new Error('Invalid master seed provided.');
	}
}
