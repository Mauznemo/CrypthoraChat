import { encryptFile } from '$lib/crypto/file';
import { modalStore } from '$lib/stores/modal.svelte';

export async function tryUploadFile(file: File): Promise<boolean> {
	const encrypted = await encryptFile(file);

	const formData = new FormData();
	formData.append('encryptedData', encrypted.encryptedData, 'encrypted-file.enc');
	formData.append('encryptedFileNameBase64', encrypted.encryptedFileNameBase64);

	const res = await fetch('/api/upload-encrypted-file', {
		method: 'POST',
		body: formData
	});

	if (!res.ok) {
		const text = await res.text();
		modalStore.alert('Error', 'Failed to upload file: ' + text);
		return false;
	}

	return true;
}
export async function tryUploadProfilePicture(file: File): Promise<boolean> {
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
		return false;
	}

	return true;
}
