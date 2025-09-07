<script lang="ts">
	import '../app.css';
	import Modal from '$lib/components/Modal.svelte';
	import EmojiPicker from '$lib/components/chat/EmojiPicker.svelte';
	import EmojiKeyConverter from '$lib/components/EmojiKeyConverter.svelte';
	import ContextMenu from '$lib/components/ContextMenu.svelte';
	import EmojiVerification from '$lib/components/EmojiVerification.svelte';
	import AddUserToChat from '$lib/components/chat/AddUserToChat.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href="/icon-badge-96x96.png" />
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="relative min-h-dvh overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900">
	<!-- Purple tinted circles -->
	<div class="pointer-events-none absolute inset-0 overflow-hidden">
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

	<!-- Content area -->
	<div class="relative z-10 min-h-dvh text-white">
		{@render children?.()}
	</div>
</div>

<AddUserToChat />
<EmojiPicker />
<EmojiKeyConverter />
<EmojiVerification />
<ContextMenu />
<Modal />
