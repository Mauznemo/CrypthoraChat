<script lang="ts">
	import { onMount } from 'svelte';
	import { decryptMessage } from '$lib/messageCrypto';
	import { getPreview } from '$lib/getPreview.remote'; // Adjust path if needed
	import type { Prisma } from '$prisma';

	type MessageWithRelations = Prisma.MessageGetPayload<{
		include: { user: true; chat: true; readBy: true };
	}>;

	interface Preview {
		title: string;
		description: string;
		image?: string;
	}

	const { message, showProfile, onHover, onTouchStart } = $props<{
		message: MessageWithRelations;
		showProfile: boolean;
		onHover: (event: MouseEvent) => void;
		onTouchStart: (event: TouchEvent) => void;
	}>();

	let decryptedContent = $state<string>('');
	let extractedUrl = $state<string | null>(null);
	let preview = $state<Preview | null>(null);
	let previewError = $state<string | null>(null);
	let isLoadingPreview = $state<boolean>(false);

	// URL regex pattern - matches http/https URLs
	const urlRegex = /(https?:\/\/[^\s]+)/g;

	function extractFirstUrl(text: string): string | null {
		const matches = text.match(urlRegex);
		return matches ? matches[0] : null;
	}

	async function loadPreview(url: string) {
		if (isLoadingPreview) return;

		isLoadingPreview = true;
		previewError = null;

		try {
			preview = await getPreview(url);
		} catch (err) {
			console.error('Failed to load preview:', err);
			previewError = 'Failed to load preview';
		} finally {
			isLoadingPreview = false;
		}
	}

	onMount(async () => {
		try {
			// Decrypt the message content
			decryptedContent = await decryptMessage(message.encryptedContent);

			// Extract URL from decrypted content
			extractedUrl = extractFirstUrl(decryptedContent);

			// Load preview if URL found
			if (extractedUrl) {
				await loadPreview(extractedUrl);
			}
		} catch (err) {
			console.error('Failed to decrypt message:', err);
			decryptedContent = 'Failed to decrypt message';
		}
	});
</script>

<div class="m-2 flex items-start space-x-2">
	<!-- Profile picture and username (only shown for first message in group) -->
	<div class="flex flex-col items-center space-y-1">
		{#if showProfile}
			<div
				class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-500 text-white shadow-xl"
			>
				<p>{message.user.username?.charAt(0).toUpperCase() || 'P'}</p>
			</div>
		{:else}
			<!-- Spacer to maintain alignment -->
			<div class="flex h-8 w-8"></div>
		{/if}
	</div>

	<!-- Chat message container -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		onmouseenter={onHover}
		ontouchstart={onTouchStart}
		class="message-bubble relative flex flex-col items-start"
	>
		<!-- Username (only shown for first message in group and not for own messages) -->
		{#if showProfile}
			<div class="mb-0.5 px-1.5">
				<p class="text-sm font-medium text-gray-300">{message.user.username || 'Unknown'}</p>
			</div>
		{/if}

		<!-- Chat message bubble -->
		<div class="frosted-glass-shadow relative rounded-2xl bg-gray-700/60 p-3">
			{#if decryptedContent}
				<p class="pr-9 whitespace-pre-line text-white">
					{decryptedContent}
				</p>
			{:else}
				<p class="pr-9 whitespace-pre-line text-white">loading...</p>
			{/if}

			<!-- Timestamp -->
			<div class="absolute right-2 bottom-1 text-xs text-gray-300 opacity-70">
				{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
			</div>
		</div>

		<!-- URL Preview -->
		{#if extractedUrl}
			<div class="mt-2 w-full max-w-md">
				{#if isLoadingPreview}
					<div class="frosted-glass-shadow rounded-lg bg-gray-700/40 p-3">
						<p class="text-sm text-gray-400">Loading preview...</p>
					</div>
				{:else if previewError}
					<div class="frosted-glass-shadow rounded-lg bg-gray-700/40 p-3">
						<p class="text-sm text-red-400">{previewError}</p>
						<p class="mt-1 truncate text-xs text-gray-400">{extractedUrl}</p>
					</div>
				{:else if preview}
					<a
						href={extractedUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="frosted-glass-shadow block overflow-hidden rounded-lg bg-gray-700/40 transition-colors duration-200 hover:bg-gray-600/50"
					>
						{#if preview.image}
							<img
								src={preview.image}
								alt="Preview image"
								class="h-32 w-full object-cover"
								loading="lazy"
							/>
						{/if}
						<div class="p-3">
							<h3 class="truncate text-sm font-semibold text-white">{preview.title}</h3>
							<p class="mt-1 line-clamp-2 text-xs text-gray-300">{preview.description}</p>
							<p class="mt-2 truncate text-xs text-gray-400">{extractedUrl}</p>
						</div>
					</a>
				{/if}
			</div>
		{/if}
	</div>
</div>
