import { encryptFile } from '$lib/crypto/file';
import { modalStore } from '$lib/stores/modal.svelte';

export async function tryUploadFile(
	file: File,
	chatId: string
): Promise<{ success: boolean; filePath: string }> {
	const encrypted = await encryptFile(file);

	const formData = new FormData();
	formData.append('encryptedData', encrypted.encryptedData, 'encrypted-file.enc');
	formData.append('encryptedFileNameBase64', encrypted.encryptedFileNameBase64);
	formData.append('chatId', chatId);

	const res = await fetch('/api/upload-encrypted-file', {
		method: 'POST',
		body: formData
	});

	if (!res.ok) {
		const text = await res.text();
		modalStore.alert('Error', 'Failed to upload file: ' + text);
		return { success: false, filePath: '' };
	}

	const response = await res.json();

	return { success: true, filePath: response.filePath };
}

export async function tryUploadProfilePicture(
	file: File
): Promise<{ success: boolean; filePath: string }> {
	const formData = new FormData();

	const ext = file.name.split('.').pop() ?? 'png';
	formData.append('file', file, file.name);
	formData.append('fileExtension', ext);

	const res = await fetch('/api/upload-profile-picture', {
		method: 'POST',
		body: formData
	});

	if (!res.ok) {
		const text = await res.text();
		modalStore.alert('Error', 'Failed to upload profile picture: ' + text);
		return { success: false, filePath: '' };
	}

	const response = await res.json();

	return { success: true, filePath: response.filePath };
}
