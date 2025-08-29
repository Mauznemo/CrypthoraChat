<script lang="ts">
	import { goto } from '$app/navigation';
	import { generateAndStoreMasterKey } from '$lib/crypto/master';
	import { register } from './data.remote';

	let { data } = $props();

	let errorText: String = $state('');

	$effect(() => {
		if (data.user != null) {
			goto('/profile');
		}
	});
</script>

<div class="flex min-h-dvh items-center justify-center">
	<div class="frosted-glass m-4 w-[400px] rounded-4xl bg-gray-800/60 p-5">
		<h1 class="mb-4 text-2xl">Register</h1>

		<form
			{...register.enhance(async ({ form, data, submit }) => {
				try {
					await submit();
					form.reset();
					await generateAndStoreMasterKey();
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

			<div class="mb-10">
				<label class="mb-2" for="password">Password:</label>
				<input
					class="frosted-glass w-full rounded-full bg-gray-600 px-3 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
					type="password"
					id="password"
					name="password"
					required
				/>
			</div>

			<button
				class="frosted-glass mb-4 w-full cursor-pointer rounded-full bg-teal-600/40 py-3 text-white hover:bg-teal-500/40 focus:ring-blue-500"
				type="submit">Register</button
			>

			<p class="text-center text-red-500">{errorText}</p>
		</form>

		<p><a href="/login">Already have an account? Login</a></p>
	</div>
</div>
