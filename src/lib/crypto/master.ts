// Generate and store master key (run once on account setup)
export async function generateAndStoreMasterKey(): Promise<void> {
	const masterKey = await crypto.subtle.generateKey(
		{ name: 'AES-GCM', length: 256 },
		true, // Exportable
		['encrypt', 'decrypt']
	);
	const exported = await crypto.subtle.exportKey('raw', masterKey);
	const base64Key = arrayBufferToBase64(exported);
	localStorage.setItem('masterKey', base64Key);
}

// Retrieve and import master key (use this whenever needed)
export async function getMasterKey(): Promise<CryptoKey> {
	const base64Key = localStorage.getItem('masterKey');
	if (!base64Key) {
		throw new Error('Master key not found. Generate or import it first.');
	}
	const rawKey = base64ToArrayBuffer(base64Key);
	return crypto.subtle.importKey(
		'raw',
		rawKey,
		'AES-GCM',
		false, // Not exportable after import for security
		['encrypt', 'decrypt']
	);
}

// Get master key base64 for sharing (e.g., QR or input)
export function getMasterKeyForSharing(): string {
	const base64Key = localStorage.getItem('masterKey');
	if (!base64Key) {
		throw new Error('Master key not found. Generate it first.');
	}
	return base64Key;
}

// Import and save master key from shared base64 (for new device)
export async function importAndSaveMasterKey(base64Key: string): Promise<void> {
	try {
		const rawKey = base64ToArrayBuffer(base64Key);
		// Attempt import to validate
		await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt', 'decrypt']);
		// If valid, store
		localStorage.setItem('masterKey', base64Key);
	} catch (error) {
		throw new Error('Invalid master key provided.');
	}
}
