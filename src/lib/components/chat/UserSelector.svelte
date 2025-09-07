<script lang="ts">
	import type { SafeUser } from '$lib/types';
	import { findUsers } from './userSelector.remote';

	let {
		selectMultiple,
		userId,
		selectedUsers = $bindable<SafeUser[]>(),
		selectedUser = $bindable<SafeUser | null>(),
		filterOutUserIds,
		onSelected
	}: {
		selectMultiple: boolean;
		userId: string;
		selectedUsers?: SafeUser[];
		selectedUser?: SafeUser | null;
		filterOutUserIds?: string[];
		onSelected: (user: SafeUser) => void;
	} = $props();

	let timeout: NodeJS.Timeout;
	let searchValue = $state('');
	let users: SafeUser[] = $state([]);
	let foundUsers: boolean = $state(true);

	async function filterUsers() {
		clearTimeout(timeout);

		timeout = setTimeout(async () => {
			if (searchValue.trim().length > 0) {
				//await findUsers(searchValue).refresh();
				const queriedUsers = await findUsers(searchValue);
				users = queriedUsers.filter((u) => u.id !== userId);

				if (filterOutUserIds) {
					users = users.filter((u) => !filterOutUserIds.includes(u.id));
				}

				if (selectMultiple) foundUsers = users.length - selectedUsers.length > 0;
				else foundUsers = users.length > 0;
			}
		}, 500);
	}

	function handleUserSelected(user: SafeUser) {
		if (selectMultiple) {
			if (selectedUsers.includes(user)) {
				selectedUsers = selectedUsers.filter((u) => u.id !== user.id);
			} else {
				selectedUsers = [...selectedUsers, user];
				onSelected(user);
			}
		} else if (selectedUser?.id !== user.id) {
			selectedUser = user;
			onSelected(user);
		}
	}
</script>

<div>
	<div class="flex h-[500px] flex-col border-y border-gray-600 bg-transparent p-4">
		<p class="mb-1 text-lg font-bold">{selectMultiple ? 'Select Users' : 'Select User'}</p>
		{#if selectedUsers}
			<ul class="mini-scrollbar max-h-50 overflow-y-auto">
				{#each selectedUsers as user}
					{@const isSelected =
						(selectedUsers && selectedUsers.includes(user)) ||
						(selectedUser && selectedUser.id === user.id)}
					<div
						class="flex cursor-pointer items-center justify-start rounded-4xl p-2 hover:bg-gray-700/50"
						onclick={() => handleUserSelected(user)}
						onkeydown={() => handleUserSelected(user)}
						role="button"
						tabindex="0"
					>
						<div
							class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gray-500 text-white"
						>
							<p>{user.username?.[0].toUpperCase()}</p>
						</div>
						<div>
							<p class="ml-4 text-xl font-bold">{user.displayName}</p>
							<p class="ml-4 text-lg">@{user.username}</p>
						</div>
						{#if isSelected}
							<p class="ml-4 text-2xl font-bold">✅</p>
						{/if}
					</div>
				{/each}
			</ul>
		{/if}
		<input
			oninput={filterUsers}
			bind:value={searchValue}
			type="text"
			class="frosted-glass my-2 w-full rounded-full bg-gray-600 px-3 py-3 text-sm text-white placeholder:text-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
			placeholder="Username..."
		/>
		<ul class="mini-scrollbar overflow-y-auto">
			{#if searchValue.trim().length > 0 && !foundUsers}
				<p class="text-white">No users found</p>
			{/if}
			{#each users as user}
				{@const isSelected =
					(selectMultiple && selectedUsers && selectedUsers.some((u) => u.id === user.id)) ||
					(selectedUser && selectedUser.id === user.id)}
				{#if !selectMultiple || !selectedUsers.some((u) => u.id === user.id)}
					<div
						class="flex cursor-pointer items-center justify-start rounded-4xl p-2 hover:bg-gray-700/50"
						onclick={() => handleUserSelected(user)}
						onkeydown={() => handleUserSelected(user)}
						role="button"
						tabindex="0"
					>
						<div
							class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gray-500 text-white"
						>
							<p>{user.username?.[0].toUpperCase()}</p>
						</div>
						<div>
							<p class="ml-4 text-xl font-bold">{user.displayName}</p>
							<p class="ml-4 text-lg">@{user.username}</p>
						</div>
						{#if isSelected}
							<p class="ml-4 text-xl font-bold">✅</p>
						{/if}
					</div>
				{/if}
			{/each}
		</ul>
	</div>
</div>
