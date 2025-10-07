<script lang="ts">
	import { decryptMessage, encryptMessage } from '$lib/crypto/message';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { socketStore } from '$lib/stores/socket.svelte';
	import type { MessageWithRelations } from '$lib/types';
	import { onDestroy, onMount } from 'svelte';
	import CustomTextarea from './CustomTextarea.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { contextMenuStore, type ContextMenuItem } from '$lib/stores/contextMenu.svelte';
	import { tryUploadFile } from '$lib/fileUpload/upload';
	import LoadingSpinner from '../LoadingSpinner.svelte';
	import { removeFile } from '$lib/fileUpload/upload.remote';
	import { compressImage, isCompressible } from '$lib/utils/imageConverter';
	import { fileUtils } from '$lib/chat/fileUtils';
	import Icon from '@iconify/svelte';
	import { idb } from '$lib/idb';
	import { goto } from '$app/navigation';
	import StickerPicker from './StickerPicker.svelte';
	import { t } from 'svelte-i18n';

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

	export async function handleChatSelected(): Promise<void> {
		messageReplying = null;
		messageEditing = null;

		const draft = await getDraft();
		if (draft) {
			console.log('draft', JSON.stringify(draft.trim()));
			chatValue = draft.trim();
		} else {
			chatValue = '';
		}
	}

	let messageReplying: MessageWithRelations | null = $state(null);
	let messageEditing: MessageWithRelations | null = $state(null);

	// let chatInput: HTMLTextAreaElement;
	let typingTimeout: NodeJS.Timeout | null = $state(null);
	let draftTimeout: NodeJS.Timeout | null = null;
	let isTyping = $state(false);
	let chatValue: string = $state('');

	let selectedFiles: File[] = $state([]);
	let fileInput: HTMLInputElement;
	let previewUrls: Record<string, string> = $state({});
	let uploadingFile: File | null = $state(null);
	let uploadedFiles: File[] = $state([]);
	let containerWidth = $state(0);
	let fileSizes: number[] = $state([]);
	let compressFiles: boolean[] = $state([]);

	let stickerPicker: StickerPicker;

	async function saveDraft(): Promise<void> {
		if (!chatStore.activeChat) return;
		await idb!.put(
			'draftMessages',
			{ chatId: chatStore.activeChat.id, message: chatValue },
			chatStore.activeChat.id
		);
	}

	async function clearDraft(): Promise<void> {
		if (!chatStore.activeChat) return;
		await idb!.delete('draftMessages', chatStore.activeChat.id);
	}

	async function getDraft(): Promise<string | null> {
		if (!chatStore.activeChat) return null;
		let result = await idb!.get('draftMessages', chatStore.activeChat.id);
		if (!result) return null;
		return result.message;
	}

	function openFileSelector(): void {
		if (uploadingFile) return;
		fileInput.click();
	}

	function handleFilesSelect(event: Event, compress: boolean): void {
		const target = event.target as HTMLInputElement;
		const files = target.files;
		if (files) {
			for (let i = 0; i < files.length; i++) {
				handleFileSelect(files[i], compress);
			}
		}
	}

	function handleFileSelect(file: File, compress: boolean): void {
		selectedFiles.push(file);
		fileSizes.push(file.size);
		compressFiles.push(compress);
		if (file.type.startsWith('image/')) {
			if (previewUrls[file.name]) {
				URL.revokeObjectURL(previewUrls[file.name]);
			}
			previewUrls[file.name] = URL.createObjectURL(file);
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

		if (typingTimeout) {
			clearTimeout(typingTimeout);
		}

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

		clearDraft();

		let filePaths: string[] = [];
		if (selectedFiles.length > 0 && !messageEditing) {
			for (let i = 0; i < selectedFiles.length; i++) {
				const file = selectedFiles[i];
				uploadingFile = file;

				let fileToUpload = file;
				if (file.type.startsWith('image/') && compressFiles[i]) {
					fileToUpload = await compressImage(file);
					fileSizes[i] = fileToUpload.size;
				}

				let previewDimensions: { width: number; height: number } | null = null;
				if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
					previewDimensions = await fileUtils.getMediaDimensions(fileToUpload);
				}

				const result = await tryUploadFile(
					fileToUpload,
					chatStore.activeChat.id,
					previewDimensions
				);

				if (result.success) {
					filePaths.push(result.filePath);
					uploadedFiles.push(file);
				} else {
					filePaths.forEach(async (f) => {
						try {
							await removeFile(f);
						} catch (error) {
							console.log('Error deleting file:', error);
						}
					});
					uploadingFile = null;
					uploadedFiles = [];

					for (const url of Object.values(previewUrls)) {
						URL.revokeObjectURL(url);
					}

					selectedFiles = [];
					compressFiles = [];
					fileSizes = [];
					previewUrls = {};
					return;
				}
			}

			for (const url of Object.values(previewUrls)) {
				URL.revokeObjectURL(url);
			}

			selectedFiles = [];
			uploadingFile = null;
			compressFiles = [];
			fileSizes = [];
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
				attachmentPaths: filePaths
			});
		} catch (error) {
			modalStore.error(error, $t('chat.chat-input.error-sending-message'));
		}

		messageReplying = null;
	}

	function handleInput(): void {
		if (!chatStore.user?.id) return;
		if (!chatStore.activeChat) return;

		if (!isTyping && chatValue.trim()) {
			isTyping = true;
			console.log('start typing');
			socketStore.startTyping({
				chatId: chatStore.activeChat.id,
				username: chatStore.user?.username || 'User'
			});
		}

		if (typingTimeout) {
			clearTimeout(typingTimeout);
		}

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

		if (draftTimeout) {
			clearTimeout(draftTimeout);
		}
		draftTimeout = setTimeout(() => {
			console.log('saving draft');
			saveDraft();
		}, 500);
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
		if (uploadingFile || messageEditing) return;
		event.stopPropagation();
		const items: ContextMenuItem[] = [
			{
				id: 'add-files',
				label: $t('chat.chat-input.add-files'),
				icon: 'mdi:attach-file',
				action: () => {
					openFileSelector();
				}
			},
			// {
			// 	id: 'gif',
			// 	label: 'Gif',
			// 	icon: 'mdi:file-gif-box',
			// 	action: () => {}
			// },
			{
				id: 'sticker',
				label: $t('chat.chat-input.add-sticker'),
				icon: 'mdi:sticker-emoji',
				action: () => {
					stickerPicker.open();
				}
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
		const index = selectedFiles.indexOf(file);
		selectedFiles.splice(index, 1);
		fileSizes.splice(index, 1);
		compressFiles.splice(index, 1);
	}
</script>

{#if socketStore.typing.length > 0}
	<div class="p-2 text-sm font-bold text-gray-400">
		{socketStore.typing.map((user) => user.username).join(', ')}
		{#if socketStore.typing.length === 1}
			{$t('chat.chat-input.is-typing')}
		{:else}
			{$t('chat.chat-input.are-typing')}
		{/if}

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
					{$t('common.loading')}
				</p>
			{:then decryptedContent}
				<p class="line-clamp-4 max-w-[40ch] text-sm break-words whitespace-pre-line text-gray-100">
					<span class="font-semibold text-gray-400">{$t('chat.chat-input.reply-to')}</span>
					{decryptedContent}
				</p>
			{:catch error}
				<p class="pr-9 whitespace-pre-line text-red-300">
					{$t('chat.chat-input.failed-to-load-message')}
				</p>
			{/await}
		</div>
	</svelte:boundary>
{/if}

{#if messageEditing}
	<svelte:boundary>
		<div class="flex items-center justify-start p-2 text-sm font-bold text-gray-400">
			<button class="mr-2 text-gray-400 hover:text-white" onclick={handleCloseEdit}>✕</button>
			<span
				>{$t('chat.chat-input.edit-message')}
				{await decryptMessage({ message: messageEditing })}</span
			>
		</div>
		{#snippet pending()}
			<p class="p-2 text-sm font-bold text-gray-400">{$t('common.loading')}</p>
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
		{#each visibleFiles as file, index}
			<div
				class="relative flex min-h-[140px] w-[120px] flex-col justify-between rounded-xl bg-gray-600/60 p-2"
			>
				<button
					onclick={() => handleRemoveFile(file)}
					class="absolute top-1 right-1 cursor-pointer rounded-lg bg-gray-500/50 p-1 text-gray-200 transition-colors hover:bg-gray-500/70 hover:text-white"
					aria-label="Close modal"
				>
					<Icon icon="mdi:close" class="size-6" />
				</button>
				{#if isCompressible(file)}
					<button
						data-tooltip={compressFiles[index]
							? $t('chat.chat-input.disable-compression')
							: $t('chat.chat-input.enable-compression')}
						onclick={() => (compressFiles[index] = !compressFiles[index])}
						class="absolute top-10 right-1 cursor-pointer rounded-lg bg-gray-500/50 p-1 text-gray-200 transition-colors hover:bg-gray-500/70 hover:text-white"
						aria-label="Close modal"
					>
						<div class="relative">
							<Icon icon="mdi:shimmer-outline" class="size-6" />
							{#if !compressFiles[index]}
								<Icon icon="fa-solid:slash" class="absolute inset-0 size-6 text-red-400" />
							{/if}
						</div>
					</button>
				{/if}
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
				<div title={file.name} class="mt-2 mb-4 line-clamp-1 max-w-[120px] break-all text-gray-100">
					{file.name}
				</div>
				<p class="absolute right-2 bottom-2 text-xs font-semibold text-gray-300">
					{fileUtils.formatFileSize(fileSizes[index])}
				</p>
				{#if uploadingFile}
					<div
						class="absolute top-0 left-0 flex h-full w-full items-center justify-center rounded-xl bg-gray-600/50"
					>
						{#if uploadingFile === file}
							<LoadingSpinner />
						{:else if uploadedFiles.includes(file)}
							<Icon icon="mdi:check-circle-outline" class="size-12 text-green-500" />
						{/if}
					</div>
				{/if}
			</div>
		{/each}

		{#if remainingCount > 0}
			<div
				class="relative flex min-h-[140px] w-[120px] flex-col items-center justify-center rounded-xl bg-gray-600/60 p-2"
			>
				<Icon icon="mdi:check-circle-outline" class="mb-2 size-12 text-gray-400" />

				<div class="text-center font-semibold text-gray-100">
					{#if remainingCount === 1}
						+{remainingCount} {$t('chat.chat-input.file')}
					{:else}
						+{remainingCount} {$t('chat.chat-input.files')}
					{/if}
				</div>
				{#if uploadingFile && !visibleFiles.includes(uploadingFile)}
					<div
						class="absolute top-0 left-0 flex h-full w-full flex-col items-center justify-center rounded-xl bg-gray-600/50"
					>
						<LoadingSpinner />
						<p class="mb-5 text-center text-sm font-semibold text-gray-100">
							{$t('chat.chat-input.remaining')}
							{uploadedFiles.length - visibleFiles.length}/{remainingCount}
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
		class="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-gray-600 frosted-glass transition-colors hover:bg-accent-600/60"
		aria-label="Add attachments"
	>
		<Icon icon="mdi:plus-thick" class="size-6" />
	</button>

	<CustomTextarea
		bind:value={chatValue}
		bind:this={inputField}
		onInput={handleInput}
		onKeydown={handleKeydown}
		onFileSelected={(file) => handleFileSelect(file, true)}
		placeholder={$t('chat.chat-input.placeholder')}
		disabled={false}
	/>

	<button
		disabled={(!chatValue.trim() && selectedFiles.length === 0) || !socketStore.connected}
		onclick={sendMessage}
		class="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-accent-600/60 frosted-glass transition-colors hover:bg-accent-600/80 disabled:bg-gray-600"
		aria-label="Send Message"
	>
		<Icon icon="ic:round-send" class="ml-0.5 size-6" />
	</button>
</div>

<StickerPicker bind:this={stickerPicker} />

<input
	class="hidden"
	type="file"
	multiple
	bind:this={fileInput}
	onchange={(e) => handleFilesSelect(e, true)}
/>
