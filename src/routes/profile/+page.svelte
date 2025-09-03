<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import BackButton from '$lib/components/BackButton.svelte';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { logout, updateDisplayName } from './data.remote';

	let { data } = $props();

	let displayName: string = $state(data.user?.displayName || '');
	let logoutButtonText: string = $state('Logout');
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
