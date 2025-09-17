<script lang="ts">
	import { goto } from '$app/navigation';
	import UserSelector from '$lib/components/chat/UserSelector.svelte';
	import { encryptChatKeyForUsers, generateChatKey } from '$lib/crypto/chat';
	import { getUnverifiedUsers, verifyUser } from '$lib/crypto/userVerification';
	import { encryptKeyForStorage } from '$lib/crypto/utils';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { socketStore } from '$lib/stores/socket.svelte';
	import type { SafeUser } from '$lib/types';
	import type { PageProps } from './$types';
	import { saveEncryptedChatKey } from '$lib/chat/chat.remote';
	import { createGroup } from '../chatCreation.remote';
	import { onDestroy } from 'svelte';
	import GroupPicture from '$lib/components/chat/GroupPicture.svelte';
	import { tryUploadProfilePicture } from '$lib/fileUpload/upload';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import BackButton from '$lib/components/BackButton.svelte';

	let { data }: PageProps = $props();

	let selectedUsers: SafeUser[] = $state([]);
	let groupName = $state('');

	let loading = $state(false);

	async function handleCreateGroup() {
		try {
			loading = true;
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

				loading = false;
				return;
			}

			let imagePath: string | null = null;
			if (selectedFile) {
				const result = await tryUploadProfilePicture(selectedFile);
				if (!result.success) {
					loading = false;
					return;
				}

				imagePath = result.filePath;
			}

			const chatKey = await generateChatKey();
			const encryptedUserChatKeys = await encryptChatKeyForUsers(
				chatKey,
				selectedUsers.map((u) => u.id)
			);

			let result = await createGroup({
				groupName,
				userIds: selectedUsers.map((u) => u.id),
				encryptedUserChatKeys,
				imagePath: imagePath || undefined
			});
			const chatKeyEncrypted = await encryptKeyForStorage(chatKey);

			try {
				await saveEncryptedChatKey({
					chatId: result.chatId,
					encryptedKey: chatKeyEncrypted,
					keyVersion: 0
				});
			} catch (err) {
				console.error(err);
				modalStore.error(err, 'Failed to save chat key:');
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
			loading = false;
			if (err?.body.message) {
				modalStore.alert('Error', 'Failed to create group: ' + err.body.message);
			}
		}
	}

	let fileInput: HTMLInputElement;
	let selectedFile: File | null = null;
	let previewUrl: string | null = $state(null);

	function openFileSelector(): void {
		fileInput.click();
	}

	function handleFileSelect(event: Event): void {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			selectedFile = file;

			if (file.type.startsWith('image/')) {
				if (previewUrl) {
					URL.revokeObjectURL(previewUrl);
				}
				// Create new preview URL
				previewUrl = URL.createObjectURL(file);
			} else {
				previewUrl = null;
			}
		}
	}

	onDestroy(() => {
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
		}
	});
</script>

<div class="flex min-h-dvh items-center justify-center">
	<div
		class="m-4 flex w-full max-w-[500px] flex-col items-stretch rounded-4xl bg-gray-800/60 frosted-glass-shadow"
	>
		<div class="my-5 flex items-center gap-2 px-5 lg:my-8">
			<BackButton backPath="/chat" />
			<h1 class="mx-5 text-center text-2xl font-bold lg:mx-14 lg:text-4xl">New Group Chat</h1>
		</div>

		<div class="flex w-full justify-start space-x-4 px-5 py-3 pb-6">
			<div class="relative">
				{#if previewUrl}
					<GroupPicture size="3.5rem" customUrl={previewUrl} />

					<input
						class="hidden"
						type="file"
						bind:this={fileInput}
						onchange={handleFileSelect}
						accept=".jpg,.jpeg,.png"
					/>

					<button
						onclick={openFileSelector}
						class="absolute -right-3 -bottom-2 cursor-pointer rounded-full bg-gray-600/80 p-1.5 text-white transition-colors hover:bg-gray-600/80 hover:text-gray-200"
						data-tooltip="Edit"
						aria-label="Edit message"
						type="button"
					>
						<svg class="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
							></path>
						</svg>
					</button>
				{:else}
					<input
						class="absolute inset-0 flex size-14 cursor-pointer items-center justify-center rounded-full bg-gray-600 opacity-0 file:size-0 hover:bg-gray-500"
						type="file"
						bind:this={fileInput}
						onchange={handleFileSelect}
						accept=".jpg,.jpeg,.png"
					/>
					<div
						class="pointer-events-none flex size-14 items-center justify-center rounded-full bg-gray-600 hover:bg-gray-500"
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
					</div>
				{/if}
			</div>

			<input
				bind:value={groupName}
				type="text"
				class="mt-2 flex-1 rounded-full bg-gray-600 px-3 py-3 text-sm text-white frosted-glass placeholder:text-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
			class="m-10 mt-7 cursor-pointer rounded-full bg-teal-800/60 px-8 py-4 font-semibold frosted-glass transition-colors hover:bg-teal-600/60 disabled:bg-gray-600/60 disabled:text-gray-400 disabled:hover:bg-gray-600/60 disabled:hover:text-gray-400"
		>
			{#if loading}
				<LoadingSpinner size="1.5rem" />
			{:else}
				Create Group
			{/if}
		</button>
	</div>
</div>
