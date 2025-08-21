<script lang="ts">
	import { goto } from '$app/navigation';
	import { register } from './data.remote';

	let { data } = $props();

	let errorText: String = $state('');

	$effect(() => {
		if (data.user != null) {
			goto('/profile');
		}
	});
</script>

<div class="frosted-glass max-w-[400px] rounded-4xl bg-white/10 p-4">
	<h1 class="mb-4 text-2xl">Register</h1>

	<form
		{...register.enhance(async ({ form, data, submit }) => {
			try {
				await submit();
				form.reset();
			} catch (error: any) {
				errorText = 'Error: ' + error;
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
			>Register</button
		>

		<p class="text-red-500">{errorText}</p>
	</form>

	<p><a href="/login">Already have an account? Login</a></p>
</div>
