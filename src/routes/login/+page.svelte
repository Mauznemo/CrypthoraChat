<script lang="ts">
	import { goto } from '$app/navigation';
	import { login } from './data.remote';

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
	<div class="frosted-glass m-4 w-[400px] rounded-4xl bg-gray-800/60 p-5">
		<h1 class="mb-4 text-2xl">Login</h1>

		<form
			{...login.enhance(async ({ form, data, submit }) => {
				try {
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
					class="frosted-glass w-full rounded-full bg-gray-600 px-3 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
					type="text"
					id="username"
					name="username"
					required
				/>
			</div>

			<div class="relative mb-10">
				<label class="mb-2" for="password">Password:</label>
				<input
					class="frosted-glass w-full rounded-full bg-gray-600 px-3 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
					type={showPassword ? 'text' : 'password'}
					id="password"
					name="password"
					required
				/>
				<button
					type="button"
					class="absolute top-12 right-3 -translate-y-1/2 text-gray-300 hover:text-white"
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

			<button
				class="frosted-glass mb-4 w-full cursor-pointer rounded-full bg-teal-600/40 py-3 text-white hover:bg-teal-500/40 focus:ring-blue-500"
				type="submit">Login</button
			>

			<p class="text-center text-red-500">{errorText}</p>
		</form>

		<p><a href="/register">Don't have an account? Register</a></p>
	</div>
</div>
