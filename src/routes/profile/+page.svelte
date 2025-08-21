<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { logout } from './data.remote.js';

	let { data } = $props();

	let logoutButtonText: String = $state('Logout');
</script>

<div class="profile">
	<h1>Profile</h1>
	<p><strong>Username:</strong> {data.user?.username}</p>
	<p><strong>User ID:</strong> {data.user?.id}</p>
	<p><strong>Created:</strong> {new Date(data.user?.createdAt).toLocaleDateString()}</p>

	<button
		onclick={async () => {
			logoutButtonText = 'Loading...';
			try {
				await logout();
				await invalidateAll();
				goto('/login');
			} catch (error) {
				logoutButtonText = 'Failed: ' + error;
			}
		}}
		class="rounded-full bg-red-700 px-4 py-2">{logoutButtonText}</button
	>
</div>
