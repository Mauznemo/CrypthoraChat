<script lang="ts">
	import { decryptMessage } from '$lib/messageCrypto';
	import type { Prisma } from '$prisma';
	type MessageWithRelations = Prisma.MessageGetPayload<{
		include: { user: true; chat: true; readBy: true };
	}>;

	const { message, showProfile } = $props<{
		message: MessageWithRelations;
		showProfile: boolean;
	}>();
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
	<div class="relative flex flex-col items-start">
		<!-- Username (only shown for first message in group and not for own messages) -->
		{#if showProfile}
			<div class="mb-0.5 px-1.5">
				<p class="text-sm font-medium text-gray-300">{message.user.username || 'Unknown'}</p>
			</div>
		{/if}

		<!-- Chat message bubble -->
		<div class="frosted-glass-shadow relative rounded-2xl bg-gray-700/60 p-3">
			<svelte:boundary>
				<p class="pr-9 whitespace-pre-line text-white">
					{await decryptMessage(message.encryptedContent)}
				</p>
				{#snippet pending()}
					<p class="pr-9 whitespace-pre-line text-white">loading...</p>
				{/snippet}
			</svelte:boundary>
			<!-- Timestamp -->
			<div class="absolute right-2 bottom-1 text-xs text-gray-300 opacity-70">
				{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
			</div>
		</div>
	</div>
</div>
