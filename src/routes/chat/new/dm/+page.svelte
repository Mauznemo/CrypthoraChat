<script lang="ts">
	import { goto } from '$app/navigation';
	import UserSelector from '$lib/components/chat/UserSelector.svelte';
	import { encryptChatKeyForUser, generateChatKey } from '$lib/crypto/chat';
	import { isUserVerified, verifyUser } from '$lib/crypto/userVerification';
	import { encryptKeyForStorage } from '$lib/crypto/utils';
	import { emojiVerificationStore } from '$lib/stores/emojiVerification.svelte';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { socketStore } from '$lib/stores/socket.svelte';
	import type { SafeUser } from '$lib/types';
	import { saveEncryptedChatKey } from '../../chat.remote';
	import { createDm } from '../chatCreation.remote';
	//import { createDm } from '../chatCreation.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let selectedUser: SafeUser | null = $state(null);

	async function handleDmGroup() {
		try {
			const userUnverified = await isUserVerified(selectedUser!.id);

			if (!userUnverified) {
				modalStore.open({
					title: 'User not verified',
					content:
						'User @' +
						selectedUser!.username +
						' is not verified. You need to verify with them once before creating a chat with them.',
					buttons: [
						{
							text: 'Verify Now',
							variant: 'primary',
							onClick: () => {
								verifyUser(selectedUser!, true);
							}
						}
					]
				});
				return;
			}

			const chatKey = await generateChatKey();
			const encryptedUserChatKey = await encryptChatKeyForUser(chatKey, selectedUser!.id);

			let result = await createDm({
				userId: selectedUser!.id,
				encryptedChatKey: encryptedUserChatKey
			});
			const chatKeyEncrypted = await encryptKeyForStorage(chatKey);
			try {
				await saveEncryptedChatKey({
					chatId: result.chatId,
					encryptedKey: chatKeyEncrypted
				});
			} catch (err) {
				console.error(err);
				modalStore.alert('Error', 'Failed to save chat key: ' + err);
			}

			if (result.success) {
				socketStore.notifyNewChat({
					chatId: result.chatId,
					userIds: [selectedUser!.id],
					type: 'dm'
				});
				localStorage.setItem('lastChatId', result.chatId);
				goto('/chat');
			}
		} catch (err: any) {
			if (err?.body.message) {
				modalStore.alert('Error', 'Failed to create chat: ' + err.body.message);
			}
		}
	}
</script>

<div class="flex min-h-dvh items-center justify-center">
	<div
		class="frosted-glass-shadow m-4 flex w-full max-w-[500px] flex-col items-stretch rounded-4xl bg-gray-800/60"
	>
		<h1 class="mx-5 my-5 text-center text-2xl font-bold lg:mx-14 lg:my-8 lg:text-4xl">
			New Direct Message
		</h1>

		<UserSelector
			selectMultiple={false}
			userId={data.user?.id ?? ''}
			bind:selectedUser
			onSelected={(user) => console.log(user)}
		/>

		<button
			onclick={handleDmGroup}
			disabled={!selectedUser}
			class="frosted-glass m-10 mt-7 cursor-pointer rounded-full bg-teal-800/60 px-8 py-4 font-semibold transition-colors hover:bg-teal-600/60 disabled:bg-gray-600/60 disabled:text-gray-400 disabled:hover:bg-gray-600/60 disabled:hover:text-gray-400"
			>Start Chat</button
		>
	</div>
</div>
