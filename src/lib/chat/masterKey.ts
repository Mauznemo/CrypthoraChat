import {
	generateAndStoreMasterKey,
	hasMasterKey,
	importAndSaveMasterSeed
} from '$lib/crypto/master';
import { emojiKeyConverterStore } from '$lib/stores/emojiKeyConverter.svelte';
import { modalStore } from '$lib/stores/modal.svelte';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';

export function showMasterKeyImport(): void {
	modalStore.removeFromQueue('decryption-chat-key-error');
	emojiKeyConverterStore.openInput(
		get(t)('chat.master-key.import-master-key'),
		false,
		async (base64Seed) => {
			try {
				await importAndSaveMasterSeed(base64Seed);
			} catch (error) {
				modalStore.alert(
					get(t)('common.error'),
					get(t)('chat.master-key.failed-to-import') + ' ' + error,
					{
						onOk: () => {
							emojiKeyConverterStore.clearInput();
						}
					}
				);
				console.error(error);
			}

			emojiKeyConverterStore.close();
		}
	);
}

/** Checks if the user has a master key and if not, shows a warning */
export async function checkForMasterKey(): Promise<void> {
	if (!(await hasMasterKey()) && !emojiKeyConverterStore.isOpen) {
		modalStore.open({
			title: get(t)('common.warning'),
			content: get(t)('chat.master-key.no-master-key-found'),
			buttons: [
				{
					text: get(t)('chat.master-key.generate-new'),
					variant: 'danger',
					onClick: () => {
						modalStore.removeFromQueue('decryption-chat-key-error'); //Content of error would be outdated at this point
						modalStore.confirm(
							get(t)('common.are-you-sure'),
							get(t)('chat.master-key.generate-new-warning'),
							() => {
								generateAndStoreMasterKey();
							}
						);
					}
				},
				{
					text: get(t)('chat.master-key.import-existing'),
					variant: 'primary',
					onClick: () => {
						modalStore.removeFromQueue('public-key-integrity-error');
						showMasterKeyImport();
					}
				}
			]
		});
	}
}
