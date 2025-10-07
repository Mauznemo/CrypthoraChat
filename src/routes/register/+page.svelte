<script lang="ts">
	import { goto } from '$app/navigation';
	import { generateAndStoreKeyPair } from '$lib/crypto/keyPair';
	import { generateAndStoreMasterKey } from '$lib/crypto/master';
	import { deleteDatabase, idb } from '$lib/idb';
	import Icon from '@iconify/svelte';
	import { register } from './data.remote';
	import { getDeviceInfo } from '$lib/utils/device';
	import { t } from 'svelte-i18n';

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
		<h1 class="mb-4 text-2xl">{$t('login.register')}</h1>

		<form
			{...register.enhance(async ({ form, data, submit }) => {
				try {
					const deviceInfo = getDeviceInfo();
					register.fields.deviceOs.set(`${deviceInfo.browser} on ${deviceInfo.os}`);
					redirectToProfile = false;
					localStorage.clear();
					await deleteDatabase();
					await submit();

					if ((register.fields.allIssues()?.length ?? 0) === 0) {
						form.reset();
						await generateAndStoreMasterKey();
						await generateAndStoreKeyPair();
						goto('/chat');
					}
				} catch (e: any) {
					errorText = e?.body?.message || e?.message || String(e) || 'Something went wrong';
				}
			})}
		>
			<div class="mb-4">
				<label class="mb-2" for="username">{$t('login.username')}</label>
				<input
					class="w-full rounded-full bg-gray-600 px-3 py-3 text-sm text-white frosted-glass focus:ring-2 focus:ring-blue-500 focus:outline-none"
					type="text"
					id="username"
					name="username"
					autocomplete="username"
					required
				/>
			</div>

			<div class="relative mb-4">
				<label class="mb-2" for="password">{$t('login.password')}</label>
				<input
					class="w-full rounded-full bg-gray-600 px-3 py-3 text-sm text-white frosted-glass focus:ring-2 focus:ring-blue-500 focus:outline-none"
					type={showPassword ? 'text' : 'password'}
					id="password"
					name="password"
					autocomplete="current-password"
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
				<label class="mb-2" for="password">{$t('login.confirm-password')}</label>
				<input
					class="w-full rounded-full bg-gray-600 px-3 py-3 text-sm text-white frosted-glass focus:ring-2 focus:ring-blue-500 focus:outline-none"
					type={showPassword ? 'text' : 'password'}
					id="confirmPassword"
					name="confirmPassword"
					autocomplete="current-password"
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
				class="mb-4 w-full cursor-pointer rounded-full bg-accent-700/60 py-3 text-white frosted-glass hover:bg-accent-600/50 focus:ring-blue-500"
				type="submit">{$t('login.register')}</button
			>
			<input class="hidden" {...register.fields.deviceOs.as('hidden')} />

			<p class="text-center text-red-500">{errorText}</p>

			{#each register.fields.allIssues() || [] as issue}
				<p class="text-center text-red-500">{issue.message}</p>
			{/each}
		</form>

		<p><a href="/login">{$t('login.login-link')}</a></p>
	</div>
</div>
