import { encryptFile } from '$lib/crypto/file';
import { modalStore } from '$lib/stores/modal.svelte';
import { uploadEncryptedFile } from './upload.remote';

export async function tryUploadFile(file: File): Promise<boolean> {
	try {
		const encryptedFileData = await encryptFile(file);
		await uploadEncryptedFile({
			encryptedFileNameBase64: encryptedFileData.encryptedFileNameBase64,
			encryptedDataBase64: encryptedFileData.encryptedDataBase64
		});
		return true;
	} catch (e: any) {
		modalStore.alert('Error', 'Failed to upload file: ' + e.body.message);
		return false;
	}
}
