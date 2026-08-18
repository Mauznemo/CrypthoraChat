<script lang="ts">
	import '../app.css';
	import Modal from '$lib/components/Modal.svelte';
	import EmojiPicker from '$lib/components/chat/EmojiPicker.svelte';
	import KeySharer from '$lib/components/KeySharer.svelte';
	import ContextMenu from '$lib/components/ContextMenu.svelte';
	import EmojiVerification from '$lib/components/EmojiVerification.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { browser } from '$app/environment';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { onboardingStore } from '$lib/stores/onboarding.svelte';
	import { layoutStore } from '$lib/stores/layout.svelte';
	import { isPwaStandalone } from '$lib/utils/device';
	import { linkConfirmation } from '$lib/utils/linkConfirmation';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { t } from 'svelte-i18n';
	import { socketStore } from '$lib/stores/socket.svelte';
	import VerificationListener from '$lib/components/VerificationListener.svelte';
	import PasswordConfirm from '$lib/components/PasswordConfirm.svelte';
	import { handleBackPress } from '$lib/stores/backHandler.svelte';
	import { openExternalUrl } from '$lib/wrapper';

	let { children, data } = $props();

	function handleChatLinkClick(event: MouseEvent) {
		const anchor = (event.target as HTMLElement).closest('a[data-chat-link]');
		if (!anchor) return;

		const url = (anchor as HTMLAnchorElement).href;

		// The wrapper hands links to the system browser. Done here rather than from an inline
		// onclick in the rendered message, so a link never puts message text into a script context.
		if (openExternalUrl(url)) {
			event.preventDefault();
			return;
		}

		if (!isPwaStandalone() || !linkConfirmation.isEnabled()) return;

		event.preventDefault();

		modalStore.open({
			title: get(t)('chat.link-modal.title'),
			content: url,
			buttons: [
				{
					text: get(t)('chat.link-modal.copy'),
					variant: 'secondary',
					onClick: () => {
						navigator.clipboard.writeText(url);
						toastStore.success(get(t)('chat.link-modal.copied'));
					}
				},
				{
					text: get(t)('chat.link-modal.open'),
					variant: 'primary',
					onClick: () => {
						window.open(url, '_blank', 'noopener,noreferrer');
					}
				}
			]
		});
	}

	onMount(() => {
		onboardingStore.init();
		// Registered here rather than on /chat so it exists for every route, and as early as
		// hydration can manage. The wrapper also sets window.flutterSafeAreaInsets at document
		// start, so the read below is correct even when this listener is registered too late for
		// the wrapper's post-load notification to reach it.
		window.onFlutterSafeAreaInsetsChanged = () => {
			layoutStore.updateSafeAreaPadding();
		};
		layoutStore.updateSafeAreaPadding();

		// Android back, so the wrapper can close whatever the web app has open before it falls back
		// to browser history or leaves the app. Also registered for every route: overlays are not
		// URL backed, so any of them can be open anywhere.
		window.handleBackPress = handleBackPress;

		// Connect on every authenticated page so verification requests still arrive when the
		// user is not on /chat. The socket reports itself as foreground only from /chat, so
		// push notification behaviour is unchanged.
		if (data?.user) socketStore.connect();

		navigator.serviceWorker?.ready.then((registration) => {
			const currentLocale = get(locale);
			registration.active?.postMessage({
				type: 'SET_LOCALE',
				locale: currentLocale
			});
		});

		document.addEventListener('click', handleChatLinkClick);
		return () => document.removeEventListener('click', handleChatLinkClick);
	});
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
		<div class="relative z-10 h-dvh text-white">
			{@render children?.()}
		</div>
	{:else}
		<div class="flex min-h-dvh w-full items-center justify-center">
			<LoadingSpinner size="4.5rem" />
		</div>
	{/if}
</div>

<KeySharer />
<EmojiVerification />
<VerificationListener />
<EmojiPicker />
<ContextMenu />
<Modal />
<PasswordConfirm />
<Toast />
