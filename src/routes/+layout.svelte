<script lang="ts">
	import '../app.css';
	import Modal from '$lib/components/Modal.svelte';
	import EmojiPicker from '$lib/components/chat/EmojiPicker.svelte';
	import EmojiKeyConverter from '$lib/components/EmojiKeyConverter.svelte';
	import ContextMenu from '$lib/components/ContextMenu.svelte';
	import EmojiVerification from '$lib/components/EmojiVerification.svelte';
	import AddUserToChat from '$lib/components/chat/AddUserToChat.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { browser } from '$app/environment';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { t } from 'svelte-i18n';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href="/icon-badge-96x96.png" />
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="relative min-h-dvh overflow-hidden">
	{#if themeStore.backgroundType === 'circles' && themeStore.themeLoaded}
		<!-- Purple tinted circles -->
		<div
			class="pointer-events-none absolute inset-0 overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900"
		>
			<!-- Large circle - top left -->
			<div
				class="absolute -top-32 -left-32 h-[600px] w-[600px] rounded-full bg-gradient-to-br from-purple-600/25 to-violet-800/10 blur-3xl"
				style="animation: slowPulse 8s ease-in-out infinite;"
			></div>

			<!-- Large circle - bottom right -->
			<div
				class="absolute -right-40 -bottom-40 h-[700px] w-[700px] rounded-full bg-gradient-to-tl from-purple-800/20 to-indigo-600/8 blur-3xl"
				style="animation: slowPulse 10s ease-in-out infinite; animation-delay: 3s;"
			></div>

			<!-- Large circle - center background -->
			<div
				class="absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 transform rounded-full bg-gradient-to-br from-violet-500/24 to-purple-600/8 blur-3xl"
				style="animation: slowPulse 12s ease-in-out infinite; animation-delay: 6s;"
			></div>
		</div>
	{:else if themeStore.backgroundType === 'gradient' && themeStore.themeLoaded}
		<div
			class="pointer-events-none absolute inset-0 overflow-hidden bg-gradient-to-br from-background-1 to-background-2"
		></div>
	{:else if themeStore.backgroundType === 'solid' && themeStore.themeLoaded}
		<div class="pointer-events-none absolute inset-0 overflow-hidden bg-background-1/40"></div>
	{:else if !themeStore.themeLoaded}
		<div class="pointer-events-none absolute inset-0 overflow-hidden bg-gray-900"></div>
	{/if}

	<!-- Content area -->
	{#if browser}
		<div class="relative z-10 min-h-dvh text-white">
			{@render children?.()}
		</div>
	{:else}
		<div class="flex min-h-dvh w-full items-center justify-center">
			<LoadingSpinner size="4.5rem" />
		</div>
	{/if}
</div>

<AddUserToChat />
<EmojiKeyConverter />
<EmojiVerification />
<EmojiPicker />
<ContextMenu />
<Modal />
<Toast />
