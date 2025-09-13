<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import BackButton from '$lib/components/BackButton.svelte';
	import ProfilePicture from '$lib/components/chat/ProfilePicture.svelte';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { onDestroy } from 'svelte';
	import { changePassword, logout, updateDisplayName, updateProfilePicture } from './data.remote';
	import { tryUploadProfilePicture } from '$lib/fileUpload/upload';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Icon from '@iconify/svelte';

	let { data } = $props();

	let displayName: string = $state(data.user?.displayName || '');
	let logoutButtonText: string = $state('Logout');

	let showChangePassword = $state(false);
	let currentPassword: string = $state('');
	let newPassword: string = $state('');
	let confirmNewPassword: string = $state('');
	let showPassword = $state(false);

	let fileInput: HTMLInputElement;
	let selectedFile: File | null = null;
	let previewUrl: string | null = $state(null);

	let loadingSave = $state(false);

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

<input
	class="hidden"
	type="file"
	bind:this={fileInput}
	onchange={handleFileSelect}
	accept=".jpg,.jpeg,.png"
/>

<div class="flex flex-col items-center p-8">
	<div
		class="frosted-glass flex w-full max-w-[500px] flex-col items-stretch gap-2 rounded-4xl bg-gray-800/60 p-4"
	>
		<div class="flex gap-2">
			<BackButton />
			<h1 class="pb-2 text-2xl font-bold">Profile</h1>
		</div>
		<div class="relative mb-2 size-16">
			<ProfilePicture user={data.user} size="4rem" customUrl={previewUrl} />
			<button
				onclick={openFileSelector}
				class="absolute -right-3 -bottom-2 cursor-pointer rounded-full bg-gray-600/80 p-1.5 text-white transition-colors hover:bg-gray-600/80 hover:text-gray-200"
				title="Edit"
				aria-label="Edit message"
				type="button"
			>
				<Icon icon="mdi:image-edit-outline" class="size-6" />
			</button>
		</div>
		<p><strong>Display Name:</strong></p>
		<input class="mb-2 rounded-full bg-gray-800 p-2 px-4" type="text" bind:value={displayName} />
		<p><strong>Username:</strong> @{data.user?.username}</p>
		<p><strong>User ID:</strong> {data.user?.id}</p>
		<p><strong>Created:</strong> {new Date(data.user?.createdAt || 0).toLocaleDateString()}</p>
		{#if data.user?.isAdmin}
			<p>
				<strong>You are Admin of this Server</strong>
				<a class="text-blue-400 underline" href="/admin">Go to Admin Dashboard</a>
			</p>
		{/if}
		<button
			class="cursor-pointer text-left text-blue-400 underline"
			onclick={() => (showChangePassword = !showChangePassword)}>Change Password</button
		>

		{#if showChangePassword}
			<div class="flex gap-2">
				<p><strong>Current Password:</strong></p>
				<button
					type="button"
					class=" cursor-pointer text-gray-300 hover:text-white"
					onclick={() => (showPassword = !showPassword)}
				>
					{#if showPassword}
						<Icon class="h-6 w-6 text-gray-800 dark:text-white" icon="mdi:eye-off-outline" />
					{:else}
						<Icon class="h-6 w-6 text-gray-800 dark:text-white" icon="mdi:eye-outline" />
					{/if}
				</button>
			</div>
			<input
				class=" rounded-full bg-gray-800 p-2 px-4"
				type={showPassword ? 'text' : 'password'}
				bind:value={currentPassword}
			/>
			<p><strong>New Password:</strong></p>
			<input
				class="rounded-full bg-gray-800 p-2 px-4"
				type={showPassword ? 'text' : 'password'}
				bind:value={newPassword}
			/>
			<p><strong>Confirm New Password:</strong></p>
			<input
				class="rounded-full bg-gray-800 p-2 px-4"
				type={showPassword ? 'text' : 'password'}
				bind:value={confirmNewPassword}
			/>

			<button
				onclick={async () => {
					modalStore.confirm(
						'Change?',
						'This will log all your other devices out and you will need to re-share the master key with them.',
						async () => {
							try {
								await changePassword({ currentPassword, newPassword, confirmNewPassword });
							} catch (error: any) {
								modalStore.error(error, 'Failed to change password:');
								return;
							}
							currentPassword = '';
							newPassword = '';
							confirmNewPassword = '';
							modalStore.alert('Success', 'Password changed successfully!');
						}
					);
				}}
				class="frosted-glass mt-2 cursor-pointer rounded-full bg-teal-600/40 px-4 py-2 hover:bg-teal-500/40"
				>Change</button
			>
		{/if}

		<button
			onclick={async () => {
				loadingSave = true;
				try {
					await updateDisplayName(displayName);

					if (selectedFile) {
						const result = await tryUploadProfilePicture(selectedFile);
						if (!result.success) {
							loadingSave = false;
							return;
						}

						await updateProfilePicture(result.filePath);
					}
				} catch (error) {
					loadingSave = false;
					modalStore.error(error, 'Failed update profile:');
					return;
				}
				loadingSave = false;
				await invalidateAll();
				modalStore.alert('Success', 'Updated successfully!');
			}}
			class="frosted-glass mt-5 cursor-pointer rounded-full bg-teal-600/40 px-4 py-2 hover:bg-teal-500/40"
		>
			{#if loadingSave}
				<LoadingSpinner size="1.5rem" />
			{:else}
				Save
			{/if}
		</button>

		<button
			onclick={async () => {
				modalStore.confirm('Logout?', 'Are you sure you want to logout?', async () => {
					logoutButtonText = 'Loading...';
					try {
						await logout();
						await invalidateAll();
						goto('/login');
					} catch (error) {
						logoutButtonText = 'Failed: ' + error;
					}
				});
			}}
			class="frosted-glass mb-2 cursor-pointer rounded-full bg-red-700/40 px-4 py-2 hover:bg-red-600/40"
			>{logoutButtonText}</button
		>
	</div>
</div>
