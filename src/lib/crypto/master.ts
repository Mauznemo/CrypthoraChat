import { idb } from '$lib/idb';
import { arrayBufferToBase64, base64ToArrayBuffer } from './utils';

/** Generate and store master seed */
export async function generateAndStoreMasterKey(): Promise<void> {
	const seed = crypto.getRandomValues(new Uint8Array(16));
	const base64Seed = arrayBufferToBase64(seed.buffer);
	idb!.put('master', base64Seed, 'master');
}

/** Retrieve and derive master key from stored seed */
export async function getMasterKey(): Promise<CryptoKey> {
	const base64Seed = await idb!.get('master', 'master');
	if (!base64Seed) {
		throw new Error('Master seed not found. Generate or import it first.');
	}
	const seedBytes = new Uint8Array(base64ToArrayBuffer(base64Seed));

	const keyMaterial = await crypto.subtle.digest('SHA-256', seedBytes);

	return crypto.subtle.importKey('raw', keyMaterial, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function getHmacKey(): Promise<CryptoKey> {
	const base64Seed = await idb!.get('master', 'master');
	if (!base64Seed) {
		throw new Error('Master seed not found. Generate or import it first.');
	}
	const seedBytes = new Uint8Array(base64ToArrayBuffer(base64Seed));

	const keyMaterial = await crypto.subtle.digest('SHA-256', seedBytes);

	return crypto.subtle.importKey('raw', keyMaterial, { name: 'HMAC', hash: 'SHA-256' }, false, [
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
		console.log('Importing master seed:', masterSeedBase64);
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
