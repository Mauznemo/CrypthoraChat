<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '@iconify/svelte';
	import { login } from './data.remote';
	import { deleteDatabase } from '$lib/idb';

	let { data } = $props();

	let errorText: String = $state('');
	let showPassword = $state(false);

	$effect(() => {
		if (data.user != null) {
			goto('/profile');
		}
	});
</script>

<div class="flex min-h-dvh items-center justify-center">
	<div class="m-4 w-[400px] rounded-4xl bg-gray-800/60 p-5 frosted-glass">
		<h1 class="mb-4 text-2xl">Login</h1>

		<form
			{...login.enhance(async ({ form, data, submit }) => {
				try {
					await deleteDatabase();
					await submit();
					form.reset();
					localStorage.clear();
				} catch (error: any) {
					const errorObj: Error | undefined = JSON.parse(error);
					if (errorObj !== undefined) errorText = errorObj.message;
					else errorText = 'Something went wrong! ' + error;
				}
			})}
		>
			<div class="mb-4">
				<label class="mb-2" for="username">Username:</label>
				<input
					class="w-full rounded-full bg-gray-600 px-3 py-3 text-sm text-white frosted-glass focus:ring-2 focus:ring-blue-500 focus:outline-none"
					type="text"
					id="username"
					name="username"
					required
				/>
			</div>

			<div class="relative mb-10">
				<label class="mb-2" for="password">Password:</label>
				<input
					class="w-full rounded-full bg-gray-600 px-3 py-3 text-sm text-white frosted-glass focus:ring-2 focus:ring-blue-500 focus:outline-none"
					type={showPassword ? 'text' : 'password'}
					id="password"
					name="password"
					required
				/>
				<button
					type="button"
					class="absolute top-12 right-3 -translate-y-1/2 cursor-pointer text-gray-300 hover:text-white"
					onclick={() => (showPassword = !showPassword)}
				>
					{#if showPassword}
						<Icon class="h-6 w-6 text-gray-800 dark:text-white" icon="mdi:eye-off-outline" />
					{:else}
						<Icon class="h-6 w-6 text-gray-800 dark:text-white" icon="mdi:eye-outline" />
					{/if}
				</button>
			</div>

			<button
				class="mb-4 w-full cursor-pointer rounded-full bg-accent-600/40 py-3 text-white frosted-glass hover:bg-accent-500/40 focus:ring-blue-500"
				type="submit">Login</button
			>

			<p class="text-center text-red-500">{errorText}</p>
		</form>

		<p><a href="/register">Don't have an account? Register</a></p>
	</div>
</div>
