export const developer = {
	async logSymmetricCryptoKey(key: CryptoKey, message?: string): Promise<void> {
		try {
			const exportedKey = await crypto.subtle.exportKey('raw', key);
			const keyBytes = new Uint8Array(exportedKey);
			const keyHex = Array.from(keyBytes)
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');
			console.log(message || 'Symmetric key (hex):', keyHex);
		} catch (err) {
			console.warn('Could not export key (might be non-extractable):', err);
		}
	}
};
