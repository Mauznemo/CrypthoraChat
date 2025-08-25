<script lang="ts">
	import { modalStore } from '$lib/stores/modal.svelte';
	import type { PageProps } from './$types';
	import {
		addUsername,
		deleteUser,
		getAvailableUsernames,
		getUsers,
		removeUsername
	} from './admin.remote';

	let { data }: PageProps = $props();

	let newUsername = $state('');

	function handleDeleteUser(userId: string, username: string) {
		modalStore.alert(
			'Not supported',
			'Sorry, deleting users is not supported yet. As it would require cascading deletes (all messages by that user)'
		);
		/*modalStore.confirm(
			'Delete User',
			`Are you sure you want to delete user ${username}?`,
			async () => {
				await deleteUser(userId);
				getUsers().refresh();
			}
		);*/
	}

	function handleRemoveUsername(username: string) {
		modalStore.confirm(
			'Remove Username',
			`Are you sure you want to remove username ${username}?`,
			async () => {
				await removeUsername(username);
				getAvailableUsernames().refresh();
			}
		);
	}

	function handleAddUsername() {
		if (!newUsername.trim()) {
			modalStore.alert('Invalid Username', 'Username cannot be empty.');
			return;
		}
		modalStore.confirm(
			'Add Username',
			`Are you sure you want to add username ${newUsername}?`,
			async () => {
				await addUsername(newUsername);
				getAvailableUsernames().refresh();
			}
		);
	}
</script>

<div class="p-4">
	<h1 class="text-2xl font-bold">Admin Panel</h1>
	<p>Manage users and settings from this panel.</p>

	<h2 class="mt-5 text-xl font-bold">Registered Users</h2>
	<ul>
		<svelte:boundary>
			{#each await getUsers() as user}
				<li class="flex items-center justify-between border-b p-2">
					<div>
						<span class="inline-block w-32 font-bold text-white">{user.displayName}</span>
						<span class="mx-2 text-gray-500">|</span>
						<span class="inline-block w-32 font-bold text-white">{user.username}</span>
						<span class="mx-2 text-gray-500">|</span>
						<span class="inline-block w-80 font-bold text-white">ID: {user.id}</span>
					</div>
					<button
						onclick={() => handleDeleteUser(user.id, user.username)}
						class="ml-4 rounded-full bg-red-500 px-3 py-1 text-white hover:bg-red-600"
					>
						Delete
					</button>
				</li>
			{/each}
			{#snippet pending()}
				<p>Loading users...</p>
			{/snippet}
		</svelte:boundary>
	</ul>

	<h2 class="mt-5 text-xl font-bold">Available Usernames</h2>
	<div class="flex items-center justify-start border-b p-2">
		<input
			class="rounded-full text-black"
			type="text"
			bind:value={newUsername}
			placeholder="New username"
		/>
		<button
			onclick={() => handleAddUsername()}
			class="ml-4 rounded-full bg-green-500 px-5 py-2 text-white hover:bg-green-600"
		>
			Add
		</button>
	</div>

	<ul>
		<svelte:boundary>
			{#each await getAvailableUsernames() as username}
				<li class="flex items-center justify-between border-b p-2">
					<div>
						<span class="font-bold text-white">{username}</span>
					</div>
					<button
						onclick={() => handleRemoveUsername(username)}
						class="ml-4 rounded-full bg-red-500 px-3 py-1 text-white hover:bg-red-600"
					>
						Remove
					</button>
				</li>
			{/each}
			{#snippet pending()}
				<p>Loading users...</p>
			{/snippet}
		</svelte:boundary>
	</ul>
</div>
