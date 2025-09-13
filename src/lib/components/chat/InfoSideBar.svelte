<script lang="ts">
	import { updateGroupImage, updateGroupName } from '$lib/chat/chat.remote';
	import { chatOwner } from '$lib/chat/chatOwner';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { contextMenuStore, type ContextMenuItem } from '$lib/stores/contextMenu.svelte';
	import { infoBarStore } from '$lib/stores/infoBar.svelte';
	import { modalStore } from '$lib/stores/modal.svelte';
	import type { SafeUser } from '$lib/types';
	import { onDestroy } from 'svelte';
	import GroupPicture from './GroupPicture.svelte';
	import ProfilePicture from './ProfilePicture.svelte';
	import { tryUploadProfilePicture } from '$lib/fileUpload/upload';
	import { chatList } from '$lib/chat/chatList';
	import Icon from '@iconify/svelte';

	let groupName: string = $state('');

	let fileInput: HTMLInputElement;
	let selectedFile: File | null = $state(null);
	let previewUrl: string | null = $state(null);

	$effect(() => {
		if (infoBarStore.isOpen && chatStore.activeChat && infoBarStore.userToShow === null) {
			groupName = chatStore.activeChat.name!;
		}
	});

	function openFileSelector(): void {
		fileInput.click();
	}

	function handleFileSelect(event: Event): void {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			selectedFile = file;

			if (file.type.startsWith('image/')) {
				if (previewUrl) {
					URL.revokeObjectURL(previewUrl);
				}
				// Create new preview URL
				previewUrl = URL.createObjectURL(file);
			} else {
				previewUrl = null;
			}
		}
	}

	onDestroy(() => {
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
		}
	});

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
				icon: 'mdi:user-remove-outline',
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
			<Icon icon="mdi:close" class="size-6" />
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

				{#if chatStore.activeChat.type === 'group'}
					<div class="flex w-full flex-col items-stretch space-x-2">
						<div class="relative m-auto mb-7 size-16">
							<GroupPicture
								class="m-auto"
								chat={chatStore.activeChat}
								customUrl={previewUrl}
								size="5rem"
							/>
							<button
								onclick={openFileSelector}
								class="absolute -right-6 -bottom-5 cursor-pointer rounded-full bg-gray-600/80 p-1.5 text-white transition-colors hover:bg-gray-600/80 hover:text-gray-200"
								title="Edit"
								aria-label="Edit message"
								type="button"
							>
								<Icon icon="mdi:image-edit-outline" class="size-6" />
							</button>
						</div>

						<input
							class="mb-2 rounded-full bg-gray-800 p-2 px-4"
							type="text"
							bind:value={groupName}
						/>
						{#if groupName !== chatStore.activeChat.name || selectedFile}
							<button
								onclick={async () => {
									try {
										await updateGroupName({
											chatId: chatStore.activeChat!.id,
											groupName
										});

										if (selectedFile) {
											const result = await tryUploadProfilePicture(selectedFile);
											if (!result.success) return;

											await updateGroupImage({
												chatId: chatStore.activeChat!.id,
												imagePath: result.filePath
											});

											selectedFile = null;
											if (previewUrl) {
												URL.revokeObjectURL(previewUrl);
											}
											previewUrl = null;
										}
									} catch (error) {
										modalStore.error(error, 'Failed update chat: ');
										return;
									}

									modalStore.alert('Success', 'Updated successfully!');
								}}
								class="frosted-glass mb-2 cursor-pointer rounded-full bg-teal-600/40 px-4 py-2 hover:bg-teal-500/40"
								>Save</button
							>
						{/if}
					</div>
				{/if}
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
								<Icon icon="mdi:more-vert" class="size-6 text-gray-300 hover:text-white" />
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

<input
	class="hidden"
	type="file"
	bind:this={fileInput}
	onchange={handleFileSelect}
	accept=".jpg,.jpeg,.png"
/>
