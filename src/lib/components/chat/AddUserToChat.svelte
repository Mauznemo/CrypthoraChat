<script lang="ts">
	import UserSelector from '$lib/components/chat/UserSelector.svelte';
	import { encryptChatKeyForUsers } from '$lib/crypto/chat';
	import { getUnverifiedUsers, verifyUser } from '$lib/crypto/userVerification';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { socketStore } from '$lib/stores/socket.svelte';
	import type { SafeUser } from '$lib/types';
	import { fade } from 'svelte/transition';
	import { addUserToChat, getCurrentChatKeyVersion } from '$lib/chat/chat.remote';
	import { addUserToChatStore } from '$lib/stores/addUserToChat.svelte';
	import { chats } from '$lib/chat/chats';
	import Icon from '@iconify/svelte';

	let selectedUsers: SafeUser[] = $state([]);

	$effect(() => {
		if (addUserToChatStore.isOpen) {
			selectedUsers = [];
		}
	});

	async function handleAddUser() {
		try {
			if (!addUserToChatStore.chat) return;

			const unverifiedUserIds = await getUnverifiedUsers(selectedUsers.map((u) => u.id));
			const unverifiedUsers = selectedUsers.filter((u) => unverifiedUserIds.includes(u.id));

			if (unverifiedUsers.length > 0) {
				modalStore.open({
					title:
						selectedUsers.length === unverifiedUsers.length
							? 'All users not verified'
							: 'Some users not verified',
					content:
						(unverifiedUsers.length === 1 ? 'User ' : 'Users ') +
						unverifiedUsers.map((u) => '@' + u.username).join(', ') +
						(unverifiedUsers.length === 1 ? ' is' : ' are') +
						' not verified. You need to verify with them once before creating a chat with them.',
					buttons: [
						{
							text: 'Verify @' + unverifiedUsers[0].username,
							variant: 'primary',
							onClick: () => {
								verifyUser(unverifiedUsers[0], true);
							}
						}
					]
				});
				return;
			}

			const newChatKeyVersion = await getCurrentChatKeyVersion(addUserToChatStore.chat.id);
			if (newChatKeyVersion) addUserToChatStore.chat.currentKeyVersion = newChatKeyVersion;

			const chatKeyResult = await chats.tryGetEncryptedChatKeys(addUserToChatStore.chat);

			if (!chatKeyResult.success) {
				modalStore.error('Failed to get chat key so cannot be shared with users.');
				return;
			}

			const decryptResult = await chats.tryDecryptChatKeys(chatKeyResult.keyVersions);

			if (!decryptResult.success) {
				return;
			}

			const chatKey = decryptResult.keyVersions[addUserToChatStore.chat.currentKeyVersion].key;

			const encryptedUserChatKeys = await encryptChatKeyForUsers(
				chatKey,
				selectedUsers.map((u) => u.id)
			);

			await addUserToChat({
				chatId: addUserToChatStore.chat.id,
				userIds: selectedUsers.map((u) => u.id),
				encryptedUserChatKeys
			});

			socketStore.notifyNewChat({
				chatId: addUserToChatStore.chat.id,
				userIds: selectedUsers.map((u) => u.id),
				type: 'group'
			});

			addUserToChatStore.close();
		} catch (err: any) {
			modalStore.error(err, 'Failed to add users:');
		}
	}
</script>

{#if addUserToChatStore.isOpen}
	<div
		in:fade={{ duration: 200 }}
		out:fade={{ duration: 200 }}
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		onkeydown={(e) => {
			if (e.key === 'Escape') addUserToChatStore.close();
		}}
		role="dialog"
		aria-modal="true"
		tabindex="0"
	>
		<div
			class="m-4 flex w-full max-w-[500px] flex-col items-stretch rounded-4xl bg-gray-800/60 text-white frosted-glass-shadow"
		>
			<h1 class="mx-5 my-5 text-center text-2xl font-bold lg:mx-14 lg:my-8 lg:text-4xl">
				Add users to {addUserToChatStore.chat?.name}
			</h1>

			<button
				onclick={() => addUserToChatStore.close()}
				class="absolute top-3 right-3 p-1 text-gray-400 transition-colors hover:text-gray-200"
				aria-label="Close modal"
			>
				<Icon icon="mdi:close" class="size-6" />
			</button>

			<UserSelector
				selectMultiple={true}
				userId={chatStore.user?.id ?? ''}
				bind:selectedUsers
				filterOutUserIds={addUserToChatStore.chat?.participants.map((p) => p.user.id)}
				onSelected={(user) => console.log(user)}
			/>
			<button
				onclick={handleAddUser}
				disabled={selectedUsers.length < 1}
				class="m-10 mt-7 cursor-pointer rounded-full bg-accent-700/60 px-8 py-4 font-semibold frosted-glass transition-colors hover:bg-accent-600/50 disabled:bg-gray-600/60 disabled:text-gray-400 disabled:hover:bg-gray-600/60 disabled:hover:text-gray-400"
				>{selectedUsers.length === 1 ? 'Add User' : 'Add Users'}</button
			>
		</div>
	</div>
{/if}
