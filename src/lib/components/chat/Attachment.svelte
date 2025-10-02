<script lang="ts">
	import { fileUtils } from '$lib/chat/fileUtils';
	import { decryptFile, decryptFileName } from '$lib/crypto/file';
	import { tryGetFile, tryUploadUserSticker } from '$lib/fileUpload/upload';
	import { getFileSize } from '$lib/fileUpload/upload.remote';
	import { fileExistsInIDB, getFileFromIDB, saveFileToIDB } from '$lib/idb';
	import Icon from '@iconify/svelte';
	import LoadingSpinner from '../LoadingSpinner.svelte';
	import AudioPlayer from './AudioPlayer.svelte';
	import VideoPlayer from './VideoPlayer.svelte';
	import type { ClientMessage } from '$lib/types';
	import { tick } from 'svelte';
	import { contextMenuStore, type ContextMenuItem } from '$lib/stores/contextMenu.svelte';
	import { saveUserSticker } from '../../../routes/sticker-editor/stickerEditor.remote';
	import { blobToFile } from '$lib/utils/imageConverter';
	import { toastStore } from '$lib/stores/toast.svelte';

	const {
		attachmentPath,
		keyVersion
	}: {
		attachmentPath: string;
		keyVersion: number;
	} = $props();

	const DOWNLOAD_LIMIT = 10 * 1024 * 1024;
	let ignoreLimit = $state(false);
	let fileInIDB = $state(false);

	let fileType: 'image' | 'video' | 'audio' | 'other' = $state('other');
	let subType: string | null = $state(null);

	let previewUrl: string | null = $state(null);
	let fileSizeBytes: number = $state(0);

	let downloadingFile = $state(false);

	async function decryptName(attachmentPath: string, keyVersion: number): Promise<string> {
		if (attachmentPath.startsWith('sticker:')) {
			await tick();
			fileType = 'image';
			subType = 'sticker';
			fileSizeBytes = await getFileSize(attachmentPath);
			fileInIDB = await fileExistsInIDB(attachmentPath);
			return 'sticker.webp';
		}
		const normalized = attachmentPath.replace(/\\/g, '/');
		const serverFilename = normalized.split('/').pop() || '';
		const filename = serverFilename.split('_')[2]; //uuid_userId_filename
		const encryptedFileNameSafeBase64 = filename.split('.')[0];
		const name = await decryptFileName(encryptedFileNameSafeBase64, keyVersion);

		if (fileUtils.isImageFile(name)) fileType = 'image';
		if (fileUtils.isVideoFile(name)) fileType = 'video';
		if (fileUtils.isAudioFile(name)) fileType = 'audio';
		fileSizeBytes = await getFileSize(attachmentPath);
		fileInIDB = await fileExistsInIDB(attachmentPath);

		console.log('Attachment name:', name, fileSizeBytes, fileInIDB);
		return name;
	}

	async function getMediaUrl(attachmentPath: string, keyVersion: number, name: string) {
		console.log('getMediaUrl', attachmentPath, keyVersion, name);
		// await new Promise((resolve) => setTimeout(resolve, 50000));
		const retrievedBlob = await getFileFromIDB(attachmentPath);

		let blob: Blob;

		if (retrievedBlob) {
			previewUrl = URL.createObjectURL(retrievedBlob);
			blob = retrievedBlob;
			console.log('retrievedBlob');
		} else {
			const result = await tryGetFile(attachmentPath);
			if (!result.success) return;
			blob = await decryptFile(result.encodedData!, keyVersion);
			console.log('decryptFile');
			previewUrl = URL.createObjectURL(blob);
			await saveFileToIDB(attachmentPath, blob, name);
			console.log('saveFileToIDB');
		}

		console.log('previewUrl', previewUrl);

		return previewUrl;
	}

	async function handleDownloadFile(name: string) {
		if (downloadingFile) return;
		downloadingFile = true;
		const result = await tryGetFile(attachmentPath);
		if (!result.success) {
			downloadingFile = false;
			return;
		}
		const blob = await decryptFile(result.encodedData!, keyVersion);
		fileUtils.downloadFile(blob, name);
		downloadingFile = false;
	}

	function handleContextMenu(event: Event, name: string) {
		event.preventDefault();

		const items: ContextMenuItem[] = [
			{
				id: 'download',
				label: 'Download',
				icon: 'mdi:download',
				action: () => {
					handleDownloadFile(name);
				}
			}
		];

		if (fileType === 'image' && subType === 'sticker') {
			items.unshift({
				id: 'add',
				label: 'Add to my stickers',
				icon: 'mdi:plus',
				action: async () => {
					const getResult = await tryGetFile(attachmentPath);
					if (!getResult.success) {
						return;
					}
					const blob = await decryptFile(getResult.encodedData!, keyVersion);
					const file = blobToFile(blob, 'sticker.webp');

					const result = await tryUploadUserSticker(file);

					if (result.success) {
						await saveUserSticker(result.filePath);
						toastStore.success('Sticker added to your stickers successfully');
					}
				}
			});
		}

		contextMenuStore.openAtCursor(items);
	}
</script>

<div class="max-w-full self-stretch">
	<svelte:boundary>
		{#await decryptName(attachmentPath, keyVersion)}
			<div class="mb-2">
				<p class="text-md pr-9 font-bold whitespace-pre-line text-gray-400">Loading...</p>
			</div>
		{:then decryptedName}
			<div class="mb-2 max-w-full">
				{#if fileType === 'image'}
					{@render imagePreview(decryptedName)}
				{:else if fileType === 'video'}
					{@render videoPreview(decryptedName)}
				{:else if fileType === 'audio'}
					{@render audioPreview(decryptedName)}
				{:else if fileType === 'other'}
					{@render otherPreview(decryptedName)}
				{/if}
			</div>
		{/await}
	</svelte:boundary>
</div>

{#snippet imagePreview(name: string)}
	{#if fileSizeBytes > DOWNLOAD_LIMIT && !ignoreLimit && !fileInIDB}
		{@render ignoreLimitButton(name, fileSizeBytes)}
	{:else}
		{#await getMediaUrl(attachmentPath, keyVersion, name)}
			<div class="relative flex max-w-full items-end justify-end">
				<div
					class="relative flex h-[300px] w-[400px] max-w-full flex-col items-center justify-center rounded-xl bg-gray-500/20"
				>
					<LoadingSpinner />
					<p
						class="text-md absolute bottom-1/8 text-center font-bold whitespace-pre-line text-gray-400"
					>
						Loading image ({fileUtils.formatFileSize(fileSizeBytes)})
					</p>
				</div>
			</div>
		{:then previewUrl}
			{#if previewUrl}
				<div
					oncontextmenu={(e) => handleContextMenu(e, name)}
					role="group"
					class="max-w-[min(100%, 400px)] relative flex items-end justify-end"
				>
					<img src={previewUrl} alt="Attachment" class="max-h-[300px] rounded-lg" />

					{#if subType !== 'sticker'}
						<button
							onclick={() => {
								fileUtils.downloadFileFromUrl(previewUrl!, name);
							}}
							data-tooltip="Download"
							class="absolute top-3 right-3 cursor-pointer rounded-lg bg-gray-500/20 p-1 text-gray-100 hover:text-gray-200"
							aria-label="Download"
						>
							<Icon icon="mdi:tray-download" class="size-6" />
						</button>
					{/if}
				</div>
			{/if}
		{:catch error}
			{console.error(error)}
			<p class="text-center whitespace-pre-line text-red-400">Failed to decrypt image</p>
		{/await}
	{/if}
{/snippet}

{#snippet videoPreview(name: string)}
	{#if fileSizeBytes > DOWNLOAD_LIMIT && !ignoreLimit && !fileInIDB}
		{@render ignoreLimitButton(name, fileSizeBytes)}
	{:else}
		{#await getMediaUrl(attachmentPath, keyVersion, name)}
			<div
				oncontextmenu={(e) => handleContextMenu(e, name)}
				role="group"
				class="relative flex h-[300px] w-[400px] max-w-full flex-col items-center justify-center rounded-xl bg-gray-500/20"
			>
				<LoadingSpinner />
				<p
					class="text-md absolute bottom-1/8 text-center font-bold whitespace-pre-line text-gray-400"
				>
					Loading video ({fileUtils.formatFileSize(fileSizeBytes)})
				</p>
			</div>
		{:then previewUrl}
			{#if previewUrl}
				<div class="relative">
					<VideoPlayer src={previewUrl} />
					<!-- <video src={previewUrl} controls class="max-h-[600px] max-w-[400px] rounded-lg">
					<track kind="captions" src="" label="No captions available" />
					Your browser does not support the video tag.
				</video> -->

					<button
						onclick={() => {
							fileUtils.downloadFileFromUrl(previewUrl!, name);
						}}
						data-tooltip="Download"
						class="absolute top-3 right-3 cursor-pointer rounded-lg bg-gray-500/20 p-1 text-gray-100 hover:text-gray-200"
						aria-label="Download"
					>
						<Icon icon="mdi:tray-download" class="size-6" />
					</button>
				</div>
			{/if}
		{:catch error}
			{console.error(error)}
			<p class="text-center whitespace-pre-line text-red-400">Failed to decrypt video</p>
		{/await}
	{/if}
{/snippet}

{#snippet audioPreview(name: string)}
	{#if fileSizeBytes > DOWNLOAD_LIMIT && !ignoreLimit && !fileInIDB}
		{@render ignoreLimitButton(name, fileSizeBytes)}
	{:else}
		{#await getMediaUrl(attachmentPath, keyVersion, name)}
			<div
				class="relative flex h-[180px] w-[400px] max-w-full flex-col items-center justify-center rounded-xl bg-gray-500/20"
			>
				<LoadingSpinner />
				<p
					class="text-md absolute bottom-1/8 text-center font-bold whitespace-pre-line text-gray-400"
				>
					Loading audio ({fileUtils.formatFileSize(fileSizeBytes)})
				</p>
			</div>
		{:then previewUrl}
			{#if previewUrl}
				<div class="relative w-[400px] max-w-full">
					<AudioPlayer src={previewUrl} title={name} />
					<button
						onclick={() => {
							fileUtils.downloadFileFromUrl(previewUrl!, name);
						}}
						data-tooltip="Download"
						class="absolute top-3 right-3 cursor-pointer rounded-lg bg-gray-500/20 p-1 text-gray-100 hover:text-gray-200"
						aria-label="Download"
					>
						<Icon icon="mdi:tray-download" class="size-6" />
					</button>
				</div>
			{/if}
		{:catch error}
			{console.error(error)}
			<p class="text-center whitespace-pre-line text-red-400">Failed to decrypt audio</p>
		{/await}
	{/if}
{/snippet}

{#snippet otherPreview(name: string)}
	<div class="flex items-center rounded-xl bg-gray-500/40 px-4 py-2 pl-1">
		<svg
			class="mr-2 size-8 shrink-0 text-gray-200 md:size-12"
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
				{name.split('.').pop()?.toUpperCase() || ''}
			</text>
		</svg>
		<div>
			<p class="md:text-md line-clamp-1 pr-6 text-sm font-bold break-all text-gray-200">{name}</p>
			<p class="text-sm text-gray-300">
				{fileUtils.formatFileSize(fileSizeBytes)}
			</p>
		</div>
		<button
			onclick={() => handleDownloadFile(name)}
			data-tooltip="Download"
			class="absolute right-6 cursor-pointer text-gray-100 hover:text-gray-300"
			aria-label="Download"
		>
			{#if downloadingFile}
				<LoadingSpinner size="1.5rem" />
			{:else}
				<Icon icon="mdi:tray-download" class="size-6" />
			{/if}
		</button>
	</div>
{/snippet}

{#snippet ignoreLimitButton(name: string, fileSizeBytes: number)}
	<div
		class="relative flex h-[300px] w-[400px] max-w-full flex-col items-center justify-center rounded-xl bg-gray-500/20"
	>
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			<button
				onclick={() => {
					ignoreLimit = true;
				}}
				data-tooltip="Download and load preview"
				class="pointer-events-auto cursor-pointer rounded-full bg-black/50 p-4 text-white transition-all duration-200 hover:scale-110 hover:bg-black/70"
				aria-label="Play video"
			>
				<Icon icon="mdi:tray-download" class="size-6" />
			</button>
		</div>
		<p class="text-md absolute bottom-10 text-center font-bold whitespace-pre-line text-gray-400">
			{name} ({fileUtils.formatFileSize(fileSizeBytes)})
		</p>
		<button
			data-tooltip="Download"
			onclick={() => {
				handleDownloadFile(name);
			}}
			class="absolute top-3 right-3 cursor-pointer rounded-lg bg-gray-500/20 p-1 text-gray-100 hover:text-gray-200"
			aria-label="Download"
		>
			{#if downloadingFile}
				<LoadingSpinner size="1.5rem" />
			{:else}
				<Icon icon="mdi:tray-download" class="size-6" />
			{/if}
		</button>
	</div>
{/snippet}
