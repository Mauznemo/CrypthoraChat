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
	import { toastStore } from '$lib/stores/toast.svelte';
	import { keySharerStore } from '$lib/stores/keySharer.svelte';
	import { getMasterSeedForSharing } from '$lib/crypto/master';
	import { showMasterKeyImport } from '$lib/chat/masterKey';
	import { t } from 'svelte-i18n';
	import { compressImage } from '$lib/utils/imageConverter';
	import { onboardingStore } from '$lib/stores/onboarding.svelte';
	import { getSafeAreaPadding } from '$lib/utils/device';

	let { data } = $props();

	let displayName: string = $state(data.user?.displayName || '');

	let showChangePassword = $state(false);
	let currentPassword: string = $state('');
	let newPassword: string = $state('');
	let confirmNewPassword: string = $state('');
	let showPassword = $state(false);

	let fileInput: HTMLInputElement;
	let selectedFile: File | null = $state(null);
	let previewUrl: string | null = $state(null);

	let loadingSave = $state(false);

	function openFileSelector(): void {
		fileInput.click();
	}

	function handleFileSelect(event: Event): void {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			if (file.type.startsWith('image/')) {
				selectedFile = file;
				if (previewUrl) {
					URL.revokeObjectURL(previewUrl);
				}
				// Create new preview URL
				previewUrl = URL.createObjectURL(file);
			} else {
				toastStore.error($t('chat.info-bar.invalid-file-type'));
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
	accept="image/*"
/>

<div style="padding-top: {getSafeAreaPadding().top + 32}px;" class="flex flex-col items-center p-8">
	<div
		class="flex w-full max-w-[500px] flex-col items-stretch gap-2 rounded-4xl bg-gray-800/60 p-4 frosted-glass"
	>
		<div class="flex gap-2">
			<BackButton backPath="/chat" />
			<h1 class="pb-2 text-2xl font-bold">{$t('profile.profile')}</h1>
		</div>
		<div class="relative mb-2 size-16">
			<ProfilePicture user={data.user} size="4rem" customUrl={previewUrl} />
			<button
				onclick={openFileSelector}
				class="absolute -right-3 -bottom-2 cursor-pointer rounded-full bg-gray-600/80 p-1.5 text-white transition-colors hover:bg-gray-600/80 hover:text-gray-200"
				data-tooltip={$t('chat.edit')}
				aria-label="Edit message"
				type="button"
			>
				<Icon icon="mdi:image-edit-outline" class="size-6" />
			</button>
		</div>
		<p><strong>{$t('profile.display-name')}</strong></p>
		<input class="mb-2 rounded-full bg-gray-800 p-2 px-4" type="text" bind:value={displayName} />
		<p><strong>{$t('profile.username')}</strong> @{data.user?.username}</p>
		<p><strong>{$t('profile.user-id')}</strong> {data.user?.id}</p>
		<p>
			<strong>{$t('profile.created')}</strong>
			{new Date(data.user?.createdAt || 0).toLocaleDateString()}
		</p>
		{#if data.user?.isAdmin}
			<p>
				<strong>{$t('profile.you-are-admin')}</strong>
				<a class="text-blue-400 underline hover:text-blue-300" href="/admin"
					>{$t('profile.go-to-admin-panel')}</a
				>
			</p>
		{/if}
		<button
			class="cursor-pointer text-left text-blue-400 underline hover:text-blue-300"
			onclick={() => (showChangePassword = !showChangePassword)}
			>{$t('profile.change-password')}</button
		>
		<button
			class="flex cursor-pointer items-center gap-1 text-left text-blue-400 underline hover:text-blue-300"
			onclick={async () => {
				keySharerStore.openDisplay(
					$t('profile.master-key'),
					false,
					await getMasterSeedForSharing()
				);
			}}
			>{$t('profile.show-master-key')}
			{#if onboardingStore.showBackupMasterKeyNotice}
				<div class="h-3 w-3 rounded-full bg-orange-600"></div>
			{/if}
		</button>
		<button
			class="cursor-pointer text-left text-blue-400 underline hover:text-blue-300"
			onclick={() => showMasterKeyImport()}>{$t('profile.re-import-master-key')}</button
		>
		<br />

		{#if showChangePassword}
			<div class="flex gap-2">
				<p><strong>{$t('profile.current-password')}</strong></p>
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
			<p><strong>{$t('profile.new-password')}</strong></p>
			<input
				class="rounded-full bg-gray-800 p-2 px-4"
				type={showPassword ? 'text' : 'password'}
				bind:value={newPassword}
			/>
			<p><strong>{$t('profile.confirm-password')}</strong></p>
			<input
				class="rounded-full bg-gray-800 p-2 px-4"
				type={showPassword ? 'text' : 'password'}
				bind:value={confirmNewPassword}
			/>

			<button
				onclick={async () => {
					modalStore.confirm($t('profile.change-confirm-title'), $t('profile.change-confirm'), {
						onConfirm: async () => {
							try {
								await changePassword({ currentPassword, newPassword, confirmNewPassword });
							} catch (error: any) {
								modalStore.error(error, $t('profile.change-password-failed'));
								return;
							}
							currentPassword = '';
							newPassword = '';
							confirmNewPassword = '';
							toastStore.success($t('profile.change-password-success'));
						}
					});
				}}
				class="mt-2 cursor-pointer rounded-full bg-accent-700/60 px-4 py-2 frosted-glass hover:bg-accent-600/50"
				>{$t('profile.change-password')}</button
			>
		{/if}

		{#if data.user?.displayName !== displayName || selectedFile}
			<button
				onclick={async () => {
					displayName = displayName.trim();
					if (displayName === '') {
						modalStore.error($t('profile.error-empty-display-name'));
						return;
					}

					loadingSave = true;
					try {
						await updateDisplayName(displayName);

						if (selectedFile) {
							let compressedFile: File | null = null;
							if (selectedFile.type !== 'image/gif') {
								compressedFile = await compressImage(selectedFile);
							}

							const result = await tryUploadProfilePicture(compressedFile || selectedFile);
							if (!result.success) {
								loadingSave = false;
								return;
							}

							await updateProfilePicture(result.filePath);
						}
					} catch (error) {
						loadingSave = false;
						modalStore.error(error, $t('profile.update-failed'));
						return;
					}
					loadingSave = false;
					await invalidateAll();
					selectedFile = null;
					toastStore.success($t('profile.update-success'));
				}}
				class="mt-5 cursor-pointer rounded-full bg-accent-700/60 px-4 py-2 frosted-glass hover:bg-accent-600/50"
			>
				{#if loadingSave}
					<LoadingSpinner size="1.5rem" />
				{:else}
					{$t('common.save')}
				{/if}
			</button>
		{/if}

		<button
			onclick={async () => {
				modalStore.confirm($t('profile.logout-confirm'), $t('profile.logout-confirm-content'), {
					onConfirm: async () => {
						try {
							await logout();
							await invalidateAll();
							goto('/login');
						} catch (error) {
							modalStore.error(error, $t('profile.logout-failed'));
						}
					}
				});
			}}
			class="mb-2 cursor-pointer rounded-full bg-red-800/40 px-4 py-2 frosted-glass hover:bg-red-600/40"
			>{$t('profile.logout')}</button
		>
	</div>
</div>
