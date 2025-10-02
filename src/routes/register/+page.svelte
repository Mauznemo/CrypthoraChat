<script lang="ts">
	import { goto } from '$app/navigation';
	import { generateAndStoreKeyPair } from '$lib/crypto/keyPair';
	import { generateAndStoreMasterKey } from '$lib/crypto/master';
	import { deleteDatabase, idb } from '$lib/idb';
	import Icon from '@iconify/svelte';
	import { register } from './data.remote';

	let { data } = $props();

	let errorText: String = $state('');
	let showPassword = $state(false);
	let redirectToProfile = $state(true);

	$effect(() => {
		if (data.user != null && redirectToProfile) {
			goto('/profile');
		}
	});
</script>

<div class="flex min-h-dvh items-center justify-center">
	<div class="m-4 w-[400px] rounded-4xl bg-gray-800/60 p-5 frosted-glass">
		<h1 class="mb-4 text-2xl">Register</h1>

		<form
			{...register.enhance(async ({ form, data, submit }) => {
				try {
					redirectToProfile = false;
					localStorage.clear();
					await deleteDatabase();
					await submit();
					form.reset();
					await generateAndStoreMasterKey();
					await generateAndStoreKeyPair();
					goto('/chat');
				} catch (e: any) {
					console.error(e);

					errorText = e?.body?.message || e?.message || String(e) || 'Something went wrong';
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

			<div class="relative mb-4">
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

			<div class="relative mb-10">
				<label class="mb-2" for="password">Confirm Password:</label>
				<input
					class="w-full rounded-full bg-gray-600 px-3 py-3 text-sm text-white frosted-glass focus:ring-2 focus:ring-blue-500 focus:outline-none"
					type={showPassword ? 'text' : 'password'}
					id="confirm-password"
					name="confirm-password"
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
				type="submit">Register</button
			>

			<p class="text-center text-red-500">{errorText}</p>
		</form>

		<p><a href="/login">Already have an account? Login</a></p>
	</div>
</div>
