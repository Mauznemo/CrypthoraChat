import {
	generateAndStoreMasterKey,
	hasMasterKey,
	importAndSaveMasterSeed
} from '$lib/crypto/master';
import { emojiKeyConverterStore } from '$lib/stores/emojiKeyConverter.svelte';
import { modalStore } from '$lib/stores/modal.svelte';

export function showMasterKeyImport(): void {
	modalStore.removeFromQueue('decryption-chat-key-error');
	emojiKeyConverterStore.openInput('Import Master Key', false, async (base64Seed) => {
		try {
			await importAndSaveMasterSeed(base64Seed);
		} catch (error) {
			modalStore.alert('Error', 'Failed to import master key: ' + error, {
				onOk: () => {
					emojiKeyConverterStore.clearInput();
				}
			});
			console.error(error);
		}

		emojiKeyConverterStore.close();
	});
}

/** Checks if the user has a master key and if not, shows a warning */
export async function checkForMasterKey(): Promise<void> {
	if (!(await hasMasterKey()) && !emojiKeyConverterStore.isOpen) {
		modalStore.open({
			title: 'Warning',
			content: 'Could not find your maser key.',
			buttons: [
				{
					text: 'Generate New',
					variant: 'primary',
					onClick: () => {
						modalStore.removeFromQueue('decryption-chat-key-error'); //Content of error would be outdated at this point
						generateAndStoreMasterKey();
					}
				},
				{
					text: 'Import Existing',
					variant: 'primary',
					onClick: () => {
						showMasterKeyImport();
					}
				}
			]
		});
	}
}
