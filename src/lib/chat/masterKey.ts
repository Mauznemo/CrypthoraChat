import {
	generateAndStoreMasterKey,
	hasMasterKey,
	importAndSaveMasterSeed
} from '$lib/crypto/master';
import { keySharerStore } from '$lib/stores/keySharer.svelte';
import { modalStore } from '$lib/stores/modal.svelte';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';

export function showMasterKeyImport(): void {
	modalStore.removeFromQueue('decryption-chat-key-error');
	keySharerStore.openInput(
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
							keySharerStore.clearInput();
						}
					}
				);
				console.error(error);
			}

			keySharerStore.close();
		}
	);
}

/** Checks if the user has a master key and if not, shows a warning */
export async function checkForMasterKey(): Promise<void> {
	if (!(await hasMasterKey()) && !keySharerStore.isOpen) {
		modalStore.open({
			title: get(t)('common.warning'),
			content: get(t)('chat.master-key.no-master-key-found'),
			dismissible: false,
			buttons: [
				{
					text: get(t)('chat.master-key.generate-new'),
					variant: 'danger',
					onClick: () => {
						modalStore.removeFromQueue('decryption-chat-key-error'); //Content of error would be outdated at this point
						modalStore.confirm(
							get(t)('common.are-you-sure'),
							get(t)('chat.master-key.generate-new-warning'),
							{
								onConfirm: () => {
									generateAndStoreMasterKey();
								}
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
