import { Buffer as B } from 'buffer';

/**
 * Encrypt a message and return as base64 string for database storage.
 * Currently uses simple encoding, but can be replaced with real encryption later.
 * @param message - The plain text message to encrypt
 * @returns Promise<string> - Base64 encoded encrypted data
 */
export const encryptMessage = async (message: string): Promise<string> => {
	const encoder = new TextEncoder();
	const encodedData = encoder.encode(message);

	// TODO: Replace with real encryption (AES, etc.)
	// const encryptedData = await realEncrypt(encodedData, key);

	// Convert to base64 for database storage
	return B.from(encodedData).toString('base64');
};

/**
 * Decrypt a base64 encoded message back into a string.
 * @param encryptedData - The encrypted message as base64 string
 * @returns Promise<string> - The decrypted plain text message
 */
export const decryptMessage = async (encryptedData: string): Promise<string> => {
	// Convert from base64 back to bytes
	const dataBytes = B.from(encryptedData, 'base64');

	// TODO: Replace with real decryption (AES, etc.)
	// const decryptedBytes = await realDecrypt(dataBytes, key);

	const decoder = new TextDecoder();
	return decoder.decode(dataBytes);
};

/**
 * Optional: Convert Uint8Array to JSON-safe array for sending over Socket.IO
 */
export const uint8ArrayToArray = (data: Uint8Array): number[] => {
	return Array.from(data);
};

/**
 * Optional: Convert JSON-safe array back to Uint8Array
 */
export const arrayToUint8Array = (arr: number[]): Uint8Array => {
	return new Uint8Array(arr);
};
