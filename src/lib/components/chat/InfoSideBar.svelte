<script lang="ts">
	import { chatOwner } from '$lib/chat/chatOwner';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { contextMenuStore, type ContextMenuItem } from '$lib/stores/contextMenu.svelte';
	import { infoBarStore } from '$lib/stores/infoBar.svelte';
	import { modalStore } from '$lib/stores/modal.svelte';
	import type { SafeUser } from '$lib/types';
	import ProfilePicture from './ProfilePicture.svelte';

	export function toggle(): void {
		infoBarStore.isOpen = !infoBarStore.isOpen;
	}

	async function handleShowContextMenu(event: Event, user: SafeUser): Promise<void> {
		event.stopPropagation();
		event.preventDefault();

		const items: ContextMenuItem[] = [
			{
				id: 'remove-user',
				label: 'Remove from group',
				iconSvg: 'M7.757 12h8.486M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
				action: async () => {
					modalStore.confirm(
						'Are you sure?',
						'Are you sure you want to remove @' + user.username + ' from the group?',
						() => {
							chatOwner.tryRemoveUser(chatStore.activeChat!.id, user.id);
						}
					);
				}
			}
		];

		contextMenuStore.open(event.target as HTMLElement, items);
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
			{@const chatOwnerId = chatStore.activeChat.ownerId}
			{@const isOwner = chatStore.activeChat.ownerId === chatStore.user?.id}
			<div class="flex flex-col items-start space-y-2">
				<p class="mb-5 text-2xl font-bold">Group Info</p>
				<p>Participants:</p>
				{#each chatStore.activeChat.participants as participant}
					<div class="flex items-center space-x-2">
						<ProfilePicture user={participant.user} />
						<div>
							<div class="flex items-center space-x-2">
								<p class="line-clamp-1 font-bold break-all">
									{participant.user.displayName}
								</p>
								{#if participant.user.id === chatOwnerId}
									<p title="Owner of the group" class="text-sm text-gray-400 select-none">Owner</p>
								{/if}
							</div>
							<button
								onclick={() => infoBarStore.openUserInfo(participant.user)}
								class="line-clamp-1 cursor-pointer break-all hover:underline"
								>@{participant.user.username}</button
							>
						</div>
						{#if isOwner && participant.user.id !== chatStore.user?.id}
							<button
								onclick={(event) => handleShowContextMenu(event, participant.user)}
								aria-label="Options"
								class="absolute right-5 cursor-pointer"
							>
								<svg
									class="h-6 w-6 text-white"
									aria-hidden="true"
									xmlns="http://www.w3.org/2000/svg"
									width="24"
									height="24"
									fill="none"
									viewBox="0 0 24 24"
								>
									<path
										stroke="currentColor"
										stroke-linecap="round"
										stroke-width="2"
										d="M12 6h.01M12 12h.01M12 18h.01"
									/>
								</svg>
							</button>
						{/if}
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
