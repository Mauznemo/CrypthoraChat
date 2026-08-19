<script lang="ts">
	import { passwordConfirmStore } from '$lib/stores/passwordConfirm.svelte';
	import { confirmPassword } from '$lib/utils/password.remote';
	import { t } from 'svelte-i18n';
	import { expoInOut } from 'svelte/easing';
	import { fade, scale } from 'svelte/transition';

	let password = $state('');
	let showPassword = $state(false);
	let isChecking = $state(false);
	let errorMessage = $state('');
	let inputElement = $state<HTMLInputElement>();
	/**
	 * Chrome ignores `autocomplete="off"` on password fields and fills saved credentials the moment
	 * the field is inserted, which would hand the confirmation to anyone holding an unlocked device.
	 * It does skip readonly fields though, so the field starts readonly and unlocks on first focus -
	 * by then the fill pass is over.
	 */
	let allowInput = $state(false);

	$effect(() => {
		if (!passwordConfirmStore.isOpen) {
			// Has to happen on close, not on open: this effect runs after the DOM is updated, so a
			// reset on open would come too late and the field would be inserted already unlocked.
			allowInput = false;
			return;
		}

		password = '';
		showPassword = false;
		isChecking = false;
		errorMessage = '';
		inputElement?.focus();

		// The field only has to stay readonly until the browser's fill pass is over. Unlocking on a
		// timer rather than on focus keeps it typeable even where focus never fires, and the pointer
		// and focus handlers below still unlock it immediately when the user actually reaches for it.
		const unlock = setTimeout(() => (allowInput = true), 150);
		return () => clearTimeout(unlock);
	});

	async function submit() {
		if (isChecking || !password) return;

		isChecking = true;
		errorMessage = '';

		try {
			await confirmPassword(password);
		} catch (error: any) {
			errorMessage =
				error?.status === 400
					? $t('utils.password-confirm.incorrect-password')
					: $t('utils.password-confirm.failed-to-confirm') +
						' ' +
						(error?.body?.message || error?.message || String(error));
			isChecking = false;
			password = '';
			inputElement?.focus();
			return;
		}

		password = '';
		isChecking = false;
		passwordConfirmStore.confirm();
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') passwordConfirmStore.close();
	}
</script>

<svelte:window onkeydown={passwordConfirmStore.isOpen ? handleKeyDown : undefined} />

{#if passwordConfirmStore.isOpen}
	<div
		in:fade={{ duration: 200 }}
		out:fade={{ duration: 200 }}
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		role="dialog"
		aria-modal="true"
	>
		<div
			in:scale={{ duration: 200, easing: expoInOut }}
			out:scale={{ duration: 200, easing: expoInOut }}
			class="m-4 max-h-[90vh] w-full max-w-lg overflow-auto rounded-4xl bg-gray-800/60 p-6 frosted-glass-shadow"
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-xl font-semibold text-gray-100">
					{passwordConfirmStore.config.title}
				</h2>
				<button
					onclick={() => passwordConfirmStore.close()}
					class="cursor-pointer p-1 text-gray-400 transition-colors hover:text-gray-200"
					aria-label={$t('common.close')}
				>
					<IconMdiClose class="size-6" />
				</button>
			</div>

			<div class="mb-4 whitespace-pre-wrap text-gray-300">
				{passwordConfirmStore.config.content}
			</div>

			<div class="mb-2 flex gap-2">
				<p class="font-bold text-gray-200">{$t('utils.password-confirm.password')}</p>
				<button
					type="button"
					class="cursor-pointer text-gray-300 hover:text-white"
					onclick={() => (showPassword = !showPassword)}
					aria-label={$t('utils.password-confirm.password')}
				>
					{#if showPassword}
						<IconMdiEyeOffOutline class="h-6 w-6 text-white" />
					{:else}
						<IconMdiEyeOutline class="h-6 w-6 text-white" />
					{/if}
				</button>
			</div>

			<!--
				Password managers must not fill this in: the prompt exists so that whoever is at the
				device proves they know the password, and a prefilled field would hand it to anyone
				who picked up an unlocked device.
			-->
			<input
				bind:this={inputElement}
				bind:value={password}
				readonly={!allowInput}
				onfocus={() => (allowInput = true)}
				onpointerdown={() => (allowInput = true)}
				autocomplete="off"
				data-1p-ignore
				data-lpignore="true"
				data-bwignore
				data-form-type="other"
				onkeydown={(event) => {
					if (event.key === 'Enter') submit();
				}}
				type={showPassword ? 'text' : 'password'}
				disabled={isChecking}
				class="w-full rounded-full bg-gray-800 p-2 px-4 text-white disabled:opacity-50"
			/>

			{#if errorMessage}
				<p class="mt-2 text-sm text-red-400">{errorMessage}</p>
			{/if}

			<div class="mt-6 flex justify-end gap-3">
				<button
					onclick={() => passwordConfirmStore.close()}
					class="cursor-pointer rounded-full bg-gray-700 px-4 py-2 font-medium text-gray-100 frosted-glass transition-colors hover:bg-gray-600"
				>
					{$t('common.cancel')}
				</button>
				<button
					onclick={submit}
					disabled={isChecking || !password}
					class="cursor-pointer rounded-full bg-accent-700/60 px-4 py-2 font-medium text-white frosted-glass transition-colors hover:bg-accent-600/50 disabled:cursor-not-allowed disabled:bg-gray-600/60 disabled:text-gray-400"
				>
					{$t('common.confirm')}
				</button>
			</div>
		</div>
	</div>
{/if}
