<script lang="ts">
	import { fileUtils } from '$lib/chat/fileUtils';
	import { decryptFile, decryptFileName } from '$lib/crypto/file';
	import { tryGetFile } from '$lib/fileUpload/upload';
	import { getFileSize } from '$lib/fileUpload/upload.remote';
	import { fileExistsInIDB, getFileFromIDB, saveFileToIDB } from '$lib/idb';
	import Icon from '@iconify/svelte';
	import LoadingSpinner from '../LoadingSpinner.svelte';
	import AudioPlayer from './AudioPlayer.svelte';
	import VideoPlayer from './VideoPlayer.svelte';
	import type { ClientMessage } from '$lib/types';
	import { onMount, untrack } from 'svelte';
	import { handleMessageUpdated } from '$lib/chat/messages';

	const {
		message,
		attachmentPath,
		keyVersion
	}: {
		message: ClientMessage;
		attachmentPath: string;
		keyVersion: number;
	} = $props();

	const DOWNLOAD_LIMIT = 10 * 1024 * 1024;
	let ignoreLimit = $state(false);
	let fileInIDB = $state(false);

	let fileType: 'image' | 'video' | 'audio' | 'other' = $state('other');

	let previewUrl: string | null = $state(null);
	let fileSizeBytes: number = $state(0);

	let downloadingFile = $state(false);

	let decryptedName: string | null = $state(null);
	let isLoading: boolean = $state(true);
	let error: string | null = $state(null);

	async function decryptName(attachmentPath: string, keyVersion: number): Promise<string> {
		if (
			message.decryptedAttachmentMetadata &&
			message.decryptedAttachmentMetadata[attachmentPath]
		) {
			const name = message.decryptedAttachmentMetadata[attachmentPath].name;
			fileSizeBytes = message.decryptedAttachmentMetadata[attachmentPath].size;
			fileInIDB = message.decryptedAttachmentMetadata[attachmentPath].inIdb;
			fileType = message.decryptedAttachmentMetadata[attachmentPath].fileType;
			console.log(
				'Using cached attachment metadata:',
				message.decryptedAttachmentMetadata[attachmentPath]
			);
			return name;
		} else {
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

			untrack(() => {
				if (!message.decryptedAttachmentMetadata) message.decryptedAttachmentMetadata = {};
				message.decryptedAttachmentMetadata[attachmentPath] = {
					name,
					size: fileSizeBytes,
					inIdb: fileInIDB,
					fileType,
					previewHeight: 0,
					previewWidth: 0
				};
				handleMessageUpdated(message, { triggerRerender: false });
			});

			console.log('Attachment name:', name, fileSizeBytes, fileInIDB);
			return name;
		}
	}

	function setPreviewSize(height: number, width: number) {
		if (!message.decryptedAttachmentMetadata?.[attachmentPath]) return;
		message.decryptedAttachmentMetadata[attachmentPath].previewHeight = height;
		message.decryptedAttachmentMetadata[attachmentPath].previewWidth = width;
		handleMessageUpdated(message, { triggerRerender: false });
	}

	async function getMediaUrl(
		attachmentPath: string,
		keyVersion: number,
		name: string,
		savePreviewSize: boolean
	) {
		// await new Promise((resolve) => setTimeout(resolve, 500));
		const retrievedBlob = await getFileFromIDB(attachmentPath);

		let blob: Blob;

		if (retrievedBlob) {
			previewUrl = URL.createObjectURL(retrievedBlob);
			blob = retrievedBlob;
		} else {
			const result = await tryGetFile(attachmentPath);
			if (!result.success) return;
			blob = await decryptFile(result.encodedData!, keyVersion);
			previewUrl = URL.createObjectURL(blob);
			await saveFileToIDB(attachmentPath, blob, name);
		}

		if (
			savePreviewSize &&
			previewUrl &&
			message.decryptedAttachmentMetadata?.[attachmentPath].previewHeight === 0
		) {
			await capturePreviewSize(previewUrl, name);
		}

		return previewUrl;
	}

	async function capturePreviewSize(url: string, name: string) {
		return new Promise<void>((resolve) => {
			if (fileUtils.isImageFile(name)) {
				const img = new Image();
				img.onload = () => {
					// Calculate display size with CSS constraints: max-w-[400px] h-[300px]
					const maxWidth = 400;
					const maxHeight = 300;

					let displayWidth = img.naturalWidth;
					let displayHeight = img.naturalHeight;

					if (displayHeight > maxHeight) {
						const ratio = maxHeight / displayHeight;
						displayHeight = maxHeight;
						displayWidth = displayWidth * ratio;
					}

					if (displayWidth > maxWidth) {
						const ratio = maxWidth / displayWidth;
						displayWidth = maxWidth;
						displayHeight = displayHeight * ratio;
					}

					setPreviewSize(Math.round(displayHeight), Math.round(displayWidth));
					resolve();
				};
				img.onerror = () => resolve();
				img.src = url;
			} else if (fileUtils.isVideoFile(name)) {
				const video = document.createElement('video');
				video.onloadedmetadata = () => {
					// Calculate display size with CSS constraints: max-w-[400px] max-h-[600px]
					const maxWidth = 400;
					const maxHeight = 600;

					let displayWidth = video.videoWidth;
					let displayHeight = video.videoHeight;

					// Scale down to fit within max constraints while maintaining aspect ratio
					const widthRatio = maxWidth / displayWidth;
					const heightRatio = maxHeight / displayHeight;
					const scale = Math.min(widthRatio, heightRatio, 1);

					displayWidth = displayWidth * scale;
					displayHeight = displayHeight * scale;

					setPreviewSize(Math.round(displayHeight), Math.round(displayWidth));
					resolve();
				};
				video.onerror = () => resolve();
				video.src = url;
			} else {
				resolve();
			}
		});
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

	onMount(async () => {
		try {
			decryptedName = await decryptName(attachmentPath, keyVersion);
		} catch (err: any) {
			error = err;
		} finally {
			isLoading = false;
		}
	});

	function getPreviewSkeletonSize(defaultHeight: number, defaultWidth: number): string {
		if (
			message.decryptedAttachmentMetadata &&
			message.decryptedAttachmentMetadata[attachmentPath].previewHeight !== 0
		) {
			const width = message.decryptedAttachmentMetadata?.[attachmentPath].previewWidth;
			return `height: ${message.decryptedAttachmentMetadata?.[attachmentPath].previewHeight}px; width: ${width}px; max-width: 100%;`;
		} else {
			return `height: ${defaultHeight}px; width: ${defaultWidth}px; max-width: 100%;`;
		}
	}
</script>

<div class="max-w-full self-stretch">
	<svelte:boundary>
		{#if isLoading}
			<div class="mb-2">
				<p class="text-md pr-9 font-bold whitespace-pre-line text-gray-400">Loading...</p>
			</div>
		{:else if error}
			{console.error(error)}
		{:else if decryptedName}
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
		{/if}
	</svelte:boundary>
</div>

{#snippet imagePreview(name: string)}
	{#if fileSizeBytes > DOWNLOAD_LIMIT && !ignoreLimit && !fileInIDB}
		{@render ignoreLimitButton(name, fileSizeBytes)}
	{:else}
		{#await getMediaUrl(attachmentPath, keyVersion, name, true)}
			<div class="relative flex max-w-full items-end justify-end">
				<div
					class="relative flex flex-col items-center justify-center rounded-xl bg-gray-500/20"
					style={getPreviewSkeletonSize(300, 400)}
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
				<div class="relative flex max-w-full items-end justify-end">
					<img src={previewUrl} alt="Attachment" class="max-h-[300px] max-w-[400px] rounded-lg" />

					<button
						onclick={() => {
							fileUtils.downloadFileFromUrl(previewUrl!, name);
						}}
						class="absolute top-3 right-3 cursor-pointer rounded-lg bg-gray-500/20 p-1 text-gray-100 hover:text-gray-200"
						aria-label="Download"
					>
						<Icon icon="mdi:tray-download" class="size-6" />
					</button>
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
		{#await getMediaUrl(attachmentPath, keyVersion, name, true)}
			<div
				class="relative flex flex-col items-center justify-center rounded-xl bg-gray-500/20"
				style={getPreviewSkeletonSize(300, 400)}
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
		{#await getMediaUrl(attachmentPath, keyVersion, name, false)}
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
				<div class="relative">
					<AudioPlayer src={previewUrl} title={name} />
					<button
						onclick={() => {
							fileUtils.downloadFileFromUrl(previewUrl!, name);
						}}
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
		class="relative flex h-[300px] w-[400px] flex-col items-center justify-center rounded-xl bg-gray-500/20"
	>
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			<button
				onclick={() => {
					ignoreLimit = true;
				}}
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
			title="Download to your computer"
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
