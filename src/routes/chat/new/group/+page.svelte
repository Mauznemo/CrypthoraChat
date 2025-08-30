<script lang="ts">
	import { goto } from '$app/navigation';
	import UserSelector from '$lib/components/chat/UserSelector.svelte';
	import { encryptChatKeySeedForStorage, generateChatKeySeed } from '$lib/crypto/chat';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { socketStore } from '$lib/stores/socket.svelte';
	import type { SafeUser } from '$lib/types';
	import type { PageProps } from '../$types';
	import { saveEncryptedChatKeySeed } from '../../chat.remote';
	import { createGroup } from '../chatCreation.remote';

	let { data }: PageProps = $props();

	let selectedUsers: SafeUser[] = $state([]);
	let groupName = $state('');

	async function handleCreateGroup() {
		try {
			let result = await createGroup({ groupName, userIds: selectedUsers.map((u) => u.id) });
			const chatKeySeed = generateChatKeySeed();
			const chatKeySeedEncrypted = await encryptChatKeySeedForStorage(chatKeySeed);

			try {
				await saveEncryptedChatKeySeed({
					chatId: result.chatId,
					encryptedKeySeed: chatKeySeedEncrypted
				});
			} catch (err) {
				console.error(err);
				modalStore.alert('Error', 'Failed to save chat key: ' + err);
			}

			if (result.success) {
				socketStore.notifyNewChat({
					chatId: result.chatId,
					userIds: selectedUsers.map((u) => u.id),
					type: 'group'
				});
				localStorage.setItem('lastChatId', result.chatId);
				goto('/chat');
			}
		} catch (err: any) {
			if (err?.body.message) {
				modalStore.alert('Error', 'Failed to create group: ' + err.body.message);
			}
		}
	}
</script>

<div class="flex min-h-dvh items-center justify-center">
	<div
		class="frosted-glass-shadow m-4 flex w-full max-w-[500px] flex-col items-stretch rounded-4xl bg-gray-800/60"
	>
		<h1 class="mx-5 my-5 text-center text-2xl font-bold lg:mx-14 lg:my-8 lg:text-4xl">
			New Group Chat
		</h1>

		<div class="flex w-full justify-start space-x-4 px-5 py-3 pb-6">
			<button
				class="flex size-14 cursor-pointer items-center justify-center rounded-full bg-gray-600 hover:bg-gray-500"
				aria-label="Group Image"
			>
				<svg
					class="size-7 text-white"
					aria-hidden="true"
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					fill="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						fill-rule="evenodd"
						d="M7.5 4.586A2 2 0 0 1 8.914 4h6.172a2 2 0 0 1 1.414.586L17.914 6H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1.086L7.5 4.586ZM10 12a2 2 0 1 1 4 0 2 2 0 0 1-4 0Zm2-4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
						clip-rule="evenodd"
					/>
				</svg>
			</button>

			<input
				bind:value={groupName}
				type="text"
				class="frosted-glass mt-2 flex-1 rounded-full bg-gray-600 px-3 py-3 text-sm text-white placeholder:text-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
				placeholder="Group Name..."
			/>
		</div>

		<UserSelector
			selectMultiple={true}
			userId={data.user?.id ?? ''}
			bind:selectedUsers
			onSelected={(user) => console.log(user)}
		/>
		<button
			onclick={handleCreateGroup}
			disabled={selectedUsers.length < 1 || groupName.trim().length < 1}
			class="frosted-glass m-10 mt-7 cursor-pointer rounded-full bg-teal-800/60 px-8 py-4 font-semibold transition-colors hover:bg-teal-600/60 disabled:bg-gray-600/60 disabled:text-gray-400 disabled:hover:bg-gray-600/60 disabled:hover:text-gray-400"
			>Create Group</button
		>
	</div>
</div>
