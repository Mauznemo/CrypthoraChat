<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import BackButton from '$lib/components/BackButton.svelte';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { changePassword, logout, updateDisplayName } from './data.remote';

	let { data } = $props();

	let displayName: string = $state(data.user?.displayName || '');
	let logoutButtonText: string = $state('Logout');

	let showChangePassword = $state(false);
	let currentPassword: string = $state('');
	let newPassword: string = $state('');
	let confirmNewPassword: string = $state('');
	let showPassword = $state(false);
</script>

<div class="flex flex-col items-center p-8">
	<div
		class="frosted-glass flex w-full max-w-[500px] flex-col items-stretch gap-2 rounded-4xl bg-gray-800/60 p-4"
	>
		<div class="flex gap-2">
			<BackButton />
			<h1 class="pb-2 text-2xl font-bold">Profile</h1>
		</div>
		<div
			class="mb-2 flex size-14 flex-shrink-0 items-center justify-center rounded-full bg-gray-500 text-white"
		>
			<p>{data.user?.username?.[0].toUpperCase()}</p>
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
					class=" text-gray-300 hover:text-white"
					onclick={() => (showPassword = !showPassword)}
				>
					{#if showPassword}
						<svg
							class="h-6 w-6 text-gray-800 dark:text-white"
							aria-hidden="true"
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke="currentColor"
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M3.933 13.909A4.357 4.357 0 0 1 3 12c0-1 4-6 9-6m7.6 3.8A5.068 5.068 0 0 1 21 12c0 1-3 6-9 6-.314 0-.62-.014-.918-.04M5 19 19 5m-4 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
							/>
						</svg>
					{:else}
						<svg
							class="h-6 w-6 text-gray-800 dark:text-white"
							aria-hidden="true"
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke="currentColor"
								stroke-width="2"
								d="M21 12c0 1.2-4.03 6-9 6s-9-4.8-9-6c0-1.2 4.03-6 9-6s9 4.8 9 6Z"
							/>
							<path
								stroke="currentColor"
								stroke-width="2"
								d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
							/>
						</svg>
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
								modalStore.alert('Failed', 'Failed to change password: ' + error.body.message);
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
				try {
					await updateDisplayName(displayName);
				} catch (error) {
					modalStore.alert('Error', 'Failed to update display name: ' + error);
					return;
				}
				await invalidateAll();
				modalStore.alert('Success', 'Updated successfully!');
			}}
			class="frosted-glass mt-5 cursor-pointer rounded-full bg-teal-600/40 px-4 py-2 hover:bg-teal-500/40"
			>Save</button
		>

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
