<script lang="ts">
	import { goto } from '$app/navigation';
	import { chatStore } from '$lib/stores/chat.svelte';
	import type { SafeUser } from '$lib/types';
	import type { Snippet } from 'svelte';
	import ProfilePicture from './ProfilePicture.svelte';
	import { onboardingStore } from '$lib/stores/onboarding.svelte';
	import { version } from '$app/environment';

	let {
		children
	}: {
		children: Snippet<[]>;
	} = $props();

	let isOpen = $state(false);

	export function toggle(): void {
		isOpen = !isOpen;
	}

	export function close(): void {
		isOpen = false;
	}
</script>

<div
	class={`
		fixed
		z-50
		h-full w-80
		min-w-80 border-r
		border-gray-700
		bg-gray-800/60 backdrop-blur-sm
		 transition-transform
		duration-300 md:static
		md:bg-transparent
		${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
	`}
>
	<button
		onclick={() => goto('/profile')}
		class="relative flex cursor-pointer items-center justify-start p-2"
	>
		<ProfilePicture user={chatStore.user} size="3rem" />
		<p class="ml-2 line-clamp-1 text-2xl font-bold break-all">
			{chatStore.user?.displayName}
		</p>
		{#if onboardingStore.showBackupMasterKeyNotice}
			<div class="flex items-center justify-center px-2">
				<div class="h-4 w-4 shrink-0 rounded-full bg-orange-600"></div>
			</div>
		{/if}
	</button>
	{@render children()}
	<p class="pointer-events-none absolute bottom-2 w-full text-center text-sm text-gray-500">
		Version {version}
	</p>
</div>

<!-- Backdrop for mobile -->
{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-40 bg-transparent md:hidden" onclick={toggle}></div>
{/if}
