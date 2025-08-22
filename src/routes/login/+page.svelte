<script lang="ts">
	import { goto } from '$app/navigation';
	import { login } from './data.remote';

	let { data } = $props();

	let errorText: String = $state('');

	$effect(() => {
		if (data.user != null) {
			goto('/profile');
		}
	});
</script>

<div class="flex min-h-dvh items-center justify-center">
	<div class="frosted-glass max-w-[400px] rounded-4xl bg-white/10 p-4">
		<h1 class="mb-4 text-2xl">Login</h1>

		<form
			{...login.enhance(async ({ form, data, submit }) => {
				try {
					await submit();
					form.reset();
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
					class="w-full rounded-full p-2 pl-4 text-black"
					type="text"
					id="username"
					name="username"
					required
				/>
			</div>

			<div class="mb-10">
				<label class="mb-2" for="password">Password:</label>
				<input
					class="w-full rounded-full p-2 pl-4 text-black"
					type="password"
					id="password"
					name="password"
					required
				/>
			</div>

			<button class="frosted-glass mb-4 w-full rounded-full bg-teal-600/40 py-4" type="submit"
				>Login</button
			>

			<p class="text-center text-red-500">{errorText}</p>
		</form>

		<p><a href="/register">Don't have an account? Register</a></p>
	</div>
</div>
