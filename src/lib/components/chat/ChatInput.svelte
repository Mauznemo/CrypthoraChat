<script lang="ts">
	import { decryptMessage, encryptMessage } from '$lib/crypto/message';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { socketStore } from '$lib/stores/socket.svelte';
	import type { MessageWithRelations } from '$lib/types';
	import { onDestroy } from 'svelte';
	import CustomTextarea from './CustomTextarea.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { contextMenuStore, type ContextMenuItem } from '$lib/stores/contextMenu.svelte';
	import { tryUploadFile } from '$lib/fileUpload/upload';
	import LoadingSpinner from '../LoadingSpinner.svelte';

	let {
		inputField = $bindable<CustomTextarea>()
	}: {
		inputField: CustomTextarea;
	} = $props();

	export function replyToMessage(message: MessageWithRelations): void {
		if (uploadingFile) return;
		messageReplying = message;
	}

	export async function editMessage(message: MessageWithRelations): Promise<void> {
		if (uploadingFile) return;
		for (const url of Object.values(previewUrls)) {
			URL.revokeObjectURL(url);
		}

		selectedFiles = [];
		previewUrls = {};

		messageEditing = message;
		chatValue = await decryptMessage({ message });
	}

	let messageReplying: MessageWithRelations | null = $state(null);
	let messageEditing: MessageWithRelations | null = $state(null);

	// let chatInput: HTMLTextAreaElement;
	let typingTimeout: NodeJS.Timeout | null = $state(null);
	let isTyping = $state(false);
	let chatValue: string = $state('');

	let selectedFiles: File[] = $state([]);
	let fileInput: HTMLInputElement;
	let previewUrls: Record<string, string> = $state({});
	let uploadingFile: File | null = $state(null);
	let uploadedFiles: File[] = $state([]);
	let containerWidth = $state(0);

	function openFileSelector(): void {
		if (uploadingFile) return;
		fileInput.click();
	}

	function handleFileSelect(event: Event): void {
		const target = event.target as HTMLInputElement;
		const files = target.files;
		if (files) {
			selectedFiles.push(...files);
			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				if (file.type.startsWith('image/')) {
					if (previewUrls[file.name]) {
						URL.revokeObjectURL(previewUrls[file.name]);
					}
					previewUrls[file.name] = URL.createObjectURL(file);
				}
			}

			// files.forEach((file) => {
			// });

			// if (file.type.startsWith('image/')) {
			// 	if (previewUrl) {
			// 		URL.revokeObjectURL(previewUrl);
			// 	}
			// 	// Create new preview URL

			// 	previewUrl = URL.createObjectURL(file);
			// }
		}
	}

	// Function to get the current partial mention being typed
	function getCurrentMention(text: string, cursorPosition: number): string | null {
		const beforeCursor = text.slice(0, cursorPosition);
		const mentionMatch = beforeCursor.match(/@(\w*)$/);
		return mentionMatch ? mentionMatch[1] : null;
	}

	onDestroy(() => {
		for (const url of Object.values(previewUrls)) {
			URL.revokeObjectURL(url);
		}

		// Clean up typing timeout
		if (typingTimeout) {
			clearTimeout(typingTimeout);
		}

		// Stop typing indicator if active
		if (chatStore.activeChat && isTyping && chatStore.user?.id) {
			socketStore.stopTyping({
				chatId: chatStore.activeChat.id
			});
		}
	});

	async function sendMessage(): Promise<void> {
		if (uploadingFile) return;

		if (!chatStore.activeChat) {
			modalStore.alert('Error', 'Failed to send message: No chat selected');
			return;
		}

		if ((!chatValue.trim() && selectedFiles.length === 0) || !chatStore.user?.id) return;

		//TODO: Don't allow file uploads for edits
		let filePaths: string[] = [];
		if (selectedFiles.length > 0) {
			for (const file of selectedFiles) {
				uploadingFile = file;
				const result = await tryUploadFile(file, chatStore.activeChat.id);

				if (result.success) {
					filePaths.push(result.filePath);
					uploadedFiles.push(file);
				} else {
					uploadingFile = null;
					uploadedFiles = [];
					//TODO: Delete all files that were uploaded
					return;
				}
			}

			for (const url of Object.values(previewUrls)) {
				URL.revokeObjectURL(url);
			}

			selectedFiles = [];
			uploadingFile = null;
			previewUrls = {};
		}

		const messageContent = chatValue.trim();
		chatValue = '';

		if (isTyping) {
			socketStore.stopTyping({
				chatId: chatStore.activeChat.id
			});
			isTyping = false;
		}

		if (messageEditing) {
			const encryptedContent = await encryptMessage(messageContent);
			socketStore.editMessage({
				messageId: messageEditing.id,
				encryptedContent: encryptedContent,
				keyVersion: chatStore.activeChat.currentKeyVersion
			});

			messageEditing = null;
			return;
		}

		try {
			const encryptedContent = await encryptMessage(messageContent);

			socketStore.sendMessage({
				chatId: chatStore.activeChat.id,
				keyVersion: chatStore.activeChat.currentKeyVersion,
				senderId: chatStore.user.id,
				encryptedContent: encryptedContent,
				replyToId: messageReplying ? messageReplying.id : null,
				attachments: filePaths
			});
		} catch (error) {
			modalStore.alert('Error', 'Failed to send message: ' + error);
		}

		messageReplying = null;
	}

	function handleInput(): void {
		//autoGrow(inputField);
		if (!chatStore.user?.id) return;
		if (!chatStore.activeChat) return;

		// Handle typing indicators
		if (!isTyping && chatValue.trim()) {
			isTyping = true;
			console.log('start typing');
			socketStore.startTyping({
				chatId: chatStore.activeChat.id,
				username: chatStore.user?.username || 'User'
			});
		}

		// Clear existing timeout
		if (typingTimeout) {
			clearTimeout(typingTimeout);
		}

		// Set new timeout to stop typing indicator
		typingTimeout = setTimeout(() => {
			if (isTyping && chatStore.activeChat) {
				isTyping = false;
				console.log('stop typing');
				socketStore.stopTyping({
					chatId: chatStore.activeChat.id
				});
			}
		}, 1000);

		if (!chatValue.trim() && isTyping) {
			isTyping = false;
			socketStore.stopTyping({
				chatId: chatStore.activeChat.id
			});
		}
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (uploadingFile) return;
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	function autoGrow(element: HTMLTextAreaElement): void {
		element.style.height = '5px';
		element.style.height = element.scrollHeight + 'px';
	}

	function handleCloseEdit(): void {
		messageEditing = null;
		chatValue = '';
		//setTimeout(() => autoGrow(inputField), 100);
	}

	function handleCloseReply(): void {
		messageReplying = null;
	}

	function handleAttachment(event: Event): void {
		if (uploadingFile) return;
		event.stopPropagation();
		const items: ContextMenuItem[] = [
			{
				id: 'add-files',
				label: 'Add Files',
				iconSvg:
					'M18 9V4a1 1 0 0 0-1-1H8.914a1 1 0 0 0-.707.293L4.293 7.207A1 1 0 0 0 4 7.914V20a1 1 0 0 0 1 1h4M9 3v4a1 1 0 0 1-1 1H4m11 6v4m-2-2h4m3 0a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
				action: () => {
					openFileSelector();
				}
			},
			{
				id: 'gif',
				label: 'Gif',
				iconSvg:
					'M19 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1Zm0 0-4 4m5 0H4m1 0 4-4m1 4 4-4m-4 7v6l4-3-4-3Z',
				action: () => {}
			},
			{
				id: 'sticker',
				label: 'Sticker',
				iconSvg:
					'm3 16 5-7 6 6.5m6.5 2.5L16 13l-4.286 6M14 10h.01M4 19h16a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Z',
				action: () => {}
			}
		];
		contextMenuStore.open(event.target as HTMLElement, items);
	}

	function handleRemoveFile(file: File): void {
		if (uploadingFile) return;

		if (previewUrls[file.name]) {
			URL.revokeObjectURL(previewUrls[file.name]);
			delete previewUrls[file.name];
		}
		selectedFiles = selectedFiles.filter((f) => f !== file);
	}
</script>

{#if socketStore.typing.length > 0}
	<div class="p-2 text-sm font-bold text-gray-400">
		{socketStore.typing.map((user) => user.username).join(', ')}
		{socketStore.typing.length === 1 ? 'is' : 'are'} typing

		<!-- Wave animation dots with enhanced movement -->
		<span class="ml-1 inline-flex space-x-1">
			<span
				class="h-1 w-1 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s] [animation-duration:0.8s]"
			></span>
			<span
				class="h-1 w-1 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s] [animation-duration:0.8s]"
			></span>
			<span
				class="h-1 w-1 animate-bounce rounded-full bg-gray-400 [animation-delay:0s] [animation-duration:0.8s]"
			></span>
		</span>
	</div>
{/if}

{#if messageReplying}
	<svelte:boundary>
		<div class="flex items-center justify-start p-2 text-sm font-bold text-gray-400">
			<button class="mr-2 text-gray-400 hover:text-white" onclick={handleCloseReply}>✕</button>
			{#await decryptMessage({ message: messageReplying })}
				<p class="line-clamp-4 max-w-[40ch] text-sm break-words whitespace-pre-line text-gray-100">
					loading...
				</p>
			{:then decryptedContent}
				<p class="line-clamp-4 max-w-[40ch] text-sm break-words whitespace-pre-line text-gray-100">
					<span class="font-semibold text-gray-400">Replying to:</span>
					{decryptedContent}
				</p>
			{:catch error}
				<p class="pr-9 whitespace-pre-line text-red-300">Failed to load message</p>
			{/await}
		</div>
	</svelte:boundary>
{/if}

{#if messageEditing}
	<svelte:boundary>
		<div class="flex items-center justify-start p-2 text-sm font-bold text-gray-400">
			<button class="mr-2 text-gray-400 hover:text-white" onclick={handleCloseEdit}>✕</button>
			<span>Editing message: {await decryptMessage({ message: messageEditing })}</span>
		</div>
		{#snippet pending()}
			<p class="p-2 text-sm font-bold text-gray-400">loading...</p>
		{/snippet}
	</svelte:boundary>
{/if}

{#if chatValue.includes('@')}
	{@const currentMention = getCurrentMention(chatValue, chatValue.length)}
	{@const filteredUsers =
		currentMention !== null
			? chatStore.activeChat?.participants?.filter((participant) =>
					participant.user.username.toLowerCase().startsWith(currentMention.toLowerCase())
				) || []
			: []}

	{#if filteredUsers.length > 0}
		<div class="flex flex-col items-start justify-start gap-1 p-2 pl-20">
			{#each filteredUsers as participant}
				<button
					onclick={() => {
						chatValue =
							chatValue.slice(0, chatValue.length - (currentMention?.length || 0)) +
							participant.user.username;
					}}
				>
					<strong>@{participant.user.username.slice(0, currentMention?.length)}</strong
					>{participant.user.username.slice(currentMention?.length)}
				</button>
			{/each}
		</div>
	{/if}
{/if}

{#if selectedFiles.length > 0}
	{@const filesPerRow = Math.floor((containerWidth || 400) / 130)}
	{@const maxVisibleFiles = filesPerRow * 2 - 1}
	{@const visibleFiles = selectedFiles.slice(0, maxVisibleFiles)}
	{@const remainingCount = selectedFiles.length - maxVisibleFiles}

	<div class="flex flex-wrap gap-2 p-2" bind:clientWidth={containerWidth}>
		{#each visibleFiles as file}
			<div
				class="relative flex min-h-[140px] w-[120px] flex-col justify-between rounded-xl bg-gray-600/60 p-2"
			>
				<button
					onclick={() => handleRemoveFile(file)}
					class="absolute top-1 right-1 cursor-pointer rounded-lg bg-gray-500/20 p-1 text-gray-400 transition-colors hover:bg-gray-500/40 hover:text-gray-200"
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
				<div class="flex flex-1 items-center justify-center">
					{#if previewUrls[file.name]}
						<img
							class="max-h-[100px] max-w-[100px] rounded-lg"
							src={previewUrls[file.name]}
							alt={file.name}
						/>
					{:else}
						<svg
							class="size-20 text-gray-800 dark:text-white"
							aria-hidden="true"
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke="currentColor"
								stroke-linejoin="round"
								stroke-width="1"
								d="M10 3v4a1 1 0 0 1-1 1H5m14-4v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7.914a1 1 0 0 1 .293-.707l3.914-3.914A1 1 0 0 1 9.914 3H18a1 1 0 0 1 1 1Z"
							/>
							<text
								class="select-none"
								x="12"
								y="15"
								text-anchor="middle"
								dominant-baseline="middle"
								fill="currentColor"
								font-size="5"
								font-family="Arial, sans-serif"
								font-weight="bold"
							>
								{file.name.split('.').pop()?.toUpperCase() || ''}
							</text>
						</svg>
					{/if}
				</div>
				<div title={file.name} class="mt-2 line-clamp-1 max-w-[120px] break-all text-gray-100">
					{file.name}
				</div>
				{#if uploadingFile}
					<div
						class="absolute top-0 left-0 flex h-full w-full items-center justify-center rounded-xl bg-gray-600/50"
					>
						{#if uploadingFile === file}
							<LoadingSpinner />
						{:else if uploadedFiles.includes(file)}
							<svg
								class="size-12 text-green-500"
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
									stroke-linejoin="round"
									stroke-width="2"
									d="M8.5 11.5 11 14l4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
								/>
							</svg>
						{/if}
					</div>
				{/if}
			</div>
		{/each}

		{#if remainingCount > 0}
			<div
				class="relative flex min-h-[140px] w-[120px] flex-col items-center justify-center rounded-xl bg-gray-600/60 p-2"
			>
				<svg
					class="mb-2 size-12 text-gray-400"
					aria-hidden="true"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 4v16m8-8H4"
					/>
				</svg>
				<div class="text-center font-semibold text-gray-100">
					+{remainingCount} File{remainingCount === 1 ? '' : 's'}
				</div>
				{#if uploadingFile && !visibleFiles.includes(uploadingFile)}
					<div
						class="absolute top-0 left-0 flex h-full w-full flex-col items-center justify-center rounded-xl bg-gray-600/50"
					>
						<LoadingSpinner />
						<p class="mb-5 text-center text-sm font-semibold text-gray-100">
							Remaining {uploadedFiles.length - visibleFiles.length}/{remainingCount}
						</p>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<!-- Input Field -->
<div class="sticky bottom-0 flex w-full gap-2 px-4 pt-2">
	<button
		onclick={handleAttachment}
		class="frosted-glass flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-gray-600 transition-colors hover:bg-teal-600/60"
		aria-label="Add attachments"
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
				stroke-linejoin="round"
				stroke-width="2"
				d="M5 12h14m-7 7V5"
			/>
		</svg>
	</button>

	<CustomTextarea
		bind:value={chatValue}
		bind:this={inputField}
		oninput={handleInput}
		onkeydown={handleKeydown}
		placeholder="Type your message here..."
		disabled={false}
	/>

	<button
		disabled={(!chatValue.trim() && selectedFiles.length === 0) || !socketStore.connected}
		onclick={sendMessage}
		class="frosted-glass flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-teal-600/60 transition-colors hover:bg-teal-600/80 disabled:bg-gray-600"
		aria-label="Send Message"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="2"
			stroke="currentColor"
			class="ml-0.5 size-6"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
			/>
		</svg>
	</button>
</div>

<input class="hidden" type="file" multiple bind:this={fileInput} onchange={handleFileSelect} />
