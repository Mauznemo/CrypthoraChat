<script lang="ts">
	import { chatStore } from '$lib/stores/chat.svelte';
	import { infoBarStore } from '$lib/stores/infoBar.svelte';
	import ProfilePicture from './ProfilePicture.svelte';

	// let {
	// 	children
	// }: {
	// 	children: Snippet<[]>;
	// } = $props();

	export function toggle(): void {
		infoBarStore.isOpen = !infoBarStore.isOpen;
	}
</script>

{#if infoBarStore.isOpen && (chatStore.activeChat || infoBarStore.userToShow)}
	<div
		class="
		fixed right-0 z-50 h-full w-full min-w-80 border-l border-gray-700 bg-gray-800/60 p-5 backdrop-blur-sm transition-transform duration-300 md:w-80 xl:static xl:bg-transparent"
	>
		<button
			onclick={() => infoBarStore.close()}
			class="absolute right-5 cursor-pointer p-1 text-gray-400 transition-colors hover:text-gray-200"
			aria-label="Close modal"
		>
			<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M6 18L18 6M6 6l12 12"
				></path>
			</svg>
		</button>
		<!-- {@render children()} -->
		{#if infoBarStore.userToShow}
			<div>
				<p class="mb-5 text-2xl font-bold">User Info</p>
				<div class="flex flex-col items-center space-x-2">
					<ProfilePicture class="mb-5" user={infoBarStore.userToShow} size="5rem" />
					<p class="line-clamp-1 text-xl font-bold break-all">
						{infoBarStore.userToShow.displayName}
					</p>
					<p class="line-clamp-1 break-all">
						@{infoBarStore.userToShow.username}
					</p>
				</div>
			</div>
		{:else if chatStore.activeChat}
			<div class="flex flex-col items-start space-y-2">
				<p class="mb-5 text-2xl font-bold">Group Info</p>
				<p>Participants:</p>
				{#each chatStore.activeChat.participants as participant}
					<div class="flex items-center space-x-2">
						<ProfilePicture user={participant.user} />
						<div>
							<p class="line-clamp-1 font-bold break-all">
								{participant.user.displayName}
							</p>
							<button
								onclick={() => infoBarStore.openUserInfo(participant.user)}
								class="line-clamp-1 cursor-pointer break-all hover:underline"
								>@{participant.user.username}</button
							>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Backdrop for mobile -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-40 bg-transparent xl:hidden" onclick={toggle}></div>
{/if}
