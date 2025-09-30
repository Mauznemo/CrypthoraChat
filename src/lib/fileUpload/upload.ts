import { encryptFile } from '$lib/crypto/file';
import { modalStore } from '$lib/stores/modal.svelte';

export async function tryUploadFile(
	file: File,
	chatId: string
): Promise<{ success: boolean; filePath: string }> {
	const encrypted = await encryptFile(file);

	const formData = new FormData();
	formData.append('type', 'chatMedia');
	formData.append('chatId', chatId);
	formData.append('encryptedFileNameSafeBase64', encrypted.encryptedFileNameSafeBase64);
	formData.append('encryptedData', encrypted.encryptedData, 'encrypted-file.enc');

	const res = await fetch('/api/upload-encrypted-file', {
		method: 'POST',
		body: formData
	});

	if (!res.ok) {
		const text = await res.text();
		modalStore.error(JSON.parse(text), 'Failed to upload file:');
		return { success: false, filePath: '' };
	}

	const response = await res.json();

	return { success: true, filePath: response.filePath };
}

let activeControllers: AbortController[] = [];

export async function tryGetFile(
	filePath: string
): Promise<{ success: boolean; encodedData: ArrayBuffer | null }> {
	const controller = new AbortController();
	activeControllers.push(controller);

	activeControllers = activeControllers.filter((c) => !c.signal.aborted);

	const res = await fetch(
		`/api/get-encrypted-file-stream?filePath=${encodeURIComponent(filePath)}`,
		{ signal: controller.signal }
	);

	if (!res.ok) {
		const text = await res.text();
		const error = JSON.parse(text);
		if (error.message === 'File not found') return { success: false, encodedData: null };
		modalStore.error(error, 'Failed to get file:');
		return { success: false, encodedData: null };
	}

	const arrayBuffer = await res.arrayBuffer();
	return { success: true, encodedData: arrayBuffer };
}

export function cancelAllDownloads() {
	console.log('Cancelling', activeControllers.length, 'active downloads');
	for (const controller of activeControllers) {
		controller.abort();
	}
	activeControllers = [];
}

export async function tryUploadProfilePicture(
	file: File
): Promise<{ success: boolean; filePath: string }> {
	const formData = new FormData();

	const ext = file.name.split('.').pop() ?? 'png';
	formData.append('fileExtension', ext);
	formData.append('file', file, file.name);

	const res = await fetch('/api/upload-profile-picture', {
		method: 'POST',
		body: formData
	});

	if (!res.ok) {
		const text = await res.text();
		modalStore.error(JSON.parse(text), 'Failed to upload profile picture:');
		return { success: false, filePath: '' };
	}

	const response = await res.json();

	return { success: true, filePath: response.filePath };
}

export async function tryUploadUserSticker(
	file: File
): Promise<{ success: boolean; filePath: string }> {
	const encrypted = await encryptFile(file, 'master');

	const formData = new FormData();
	formData.append('type', 'userSticker');
	formData.append('encryptedFileNameSafeBase64', encrypted.encryptedFileNameSafeBase64);
	formData.append('encryptedData', encrypted.encryptedData, 'encrypted-file.enc');

	const res = await fetch('/api/upload-encrypted-file', {
		method: 'POST',
		body: formData
	});

	if (!res.ok) {
		const text = await res.text();
		modalStore.error(JSON.parse(text), 'Failed to upload file:');
		return { success: false, filePath: '' };
	}

	const response = await res.json();

	return { success: true, filePath: response.filePath };
}

// export async function tryGetUserSticker(
// 	filePath: string
// ): Promise<{ success: boolean; encodedData: ArrayBuffer | null }> {
// 	const controller = new AbortController();
// 	activeControllers.push(controller);

// 	activeControllers = activeControllers.filter((c) => !c.signal.aborted);

// 	const res = await fetch(
// 		`/api/get-encrypted-file-stream?filePath=${encodeURIComponent(filePath)}&type=userSticker`,
// 		{ signal: controller.signal }
// 	);

// 	if (!res.ok) {
// 		const text = await res.text();
// 		const error = JSON.parse(text);
// 		if (error.message === 'File not found') return { success: false, encodedData: null };
// 		modalStore.error(error, 'Failed to get file:');
// 		return { success: false, encodedData: null };
// 	}

// 	const arrayBuffer = await res.arrayBuffer();
// 	return { success: true, encodedData: arrayBuffer };
// }
