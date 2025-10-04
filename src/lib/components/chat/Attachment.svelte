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
	import { onDestroy, onMount, tick } from 'svelte';
	import { contextMenuStore, type ContextMenuItem } from '$lib/stores/contextMenu.svelte';
	import { saveUserSticker } from '../../../routes/sticker-editor/stickerEditor.remote';
	import { blobToFile } from '$lib/utils/imageConverter';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { t } from 'svelte-i18n';

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

	let previewDimensions: { width: number; height: number } | null = $state(null);

	onMount(() => {
		console.log('Attachment path:', attachmentPath);
		const ext = attachmentPath.split('.')[1]; //uuid_userId_filename.ext.enc
		if (fileUtils.isImageExtension(ext)) fileType = 'image';
		else if (fileUtils.isVideoExtension(ext)) fileType = 'video';
		else if (fileUtils.isAudioExtension(ext)) fileType = 'audio';

		if (fileType === 'image' && attachmentPath.startsWith('sticker:')) subType = 'sticker';

		const dimensionsRegex = /^dimensions\((\d+)x(\d+)\):.*$/;

		if (dimensionsRegex.test(attachmentPath)) {
			const match = attachmentPath.match(dimensionsRegex);

			if (match) {
				const width = parseInt(match[1], 10);
				const height = parseInt(match[2], 10);

				previewDimensions = { width, height };
				console.log(`Width: ${width}, Height: ${height}`);
			}
		}
	});

	onDestroy(() => {
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
		}
	});

	async function decryptName(attachmentPath: string, keyVersion: number): Promise<string> {
		// await new Promise((resolve) => setTimeout(resolve, 5000));
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
		const filename = serverFilename.split('_')[2]; //uuid_userId_filename.ext.enc
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
		// await new Promise((resolve) => setTimeout(resolve, 5000));
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

		console.log('previewUrl', previewUrl, 'for', name);

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
				label: $t('common.download'),
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
						toastStore.success($t('chat.attachment.sticker-added-to-my-stickers'));
					}
				}
			});
		}

		contextMenuStore.openAtCursor(items);
	}

	function isSmallPreview(): boolean {
		if (previewDimensions) {
			return previewDimensions.width < 50 || previewDimensions.height < 50;
		}
		return false;
	}

	function getPreviewSize(): string {
		if (fileType === 'image' && subType === 'sticker') {
			return 'height: 300px; width: 300px;';
		} else if (previewDimensions) {
			let maxWidth = 500;
			let maxHeight = 400;

			if (fileType === 'video') {
				maxWidth = 400;
				maxHeight = 500;
			}

			const scaleX = maxWidth / previewDimensions.width;
			const scaleY = maxHeight / previewDimensions.height;
			const scale = Math.min(scaleX, scaleY, 1);

			const clampedWidth = previewDimensions.width * scale;
			const aspectRatio = previewDimensions.width / previewDimensions.height;

			return `width: ${clampedWidth}px; aspect-ratio: ${aspectRatio}; object-fit: contain;`;
		} else if (fileType === 'image' || fileType === 'video') {
			return 'height: 300px; width: 400px; max-width: 100%;';
		} else if (fileType === 'audio') {
			return 'height: 190px; width: 400px; max-width: 100%;';
		} else if (fileType === 'other') {
			return 'height: 48px; width: 300px; max-width: 100%;';
		}
		return '';
	}
</script>

<div class="max-w-full self-stretch">
	<svelte:boundary>
		{#await decryptName(attachmentPath, keyVersion)}
			<div class="mb-2 flex items-end justify-end">
				<div
					style={getPreviewSize()}
					class="flex max-w-full flex-col items-center justify-center rounded-xl bg-gray-500/20"
				>
					{#if !isSmallPreview()}
						<p class="text-md text-center font-bold whitespace-pre-line text-gray-400">
							{$t('common.loading')}
						</p>
					{/if}
				</div>
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
					style={getPreviewSize()}
					class="relative flex flex-col items-center justify-center rounded-xl bg-gray-500/20"
				>
					{#if isSmallPreview()}
						<LoadingSpinner size="1.5rem" />
					{:else}
						<LoadingSpinner />
						<p
							class="text-md absolute bottom-1/8 text-center font-bold whitespace-pre-line text-gray-400"
						>
							{$t('chat.attachment.loading-image', {
								values: { size: fileUtils.formatFileSize(fileSizeBytes) }
							})}
						</p>
					{/if}
				</div>
			</div>
		{:then previewUrl}
			{#if previewUrl}
				<div
					oncontextmenu={(e) => handleContextMenu(e, name)}
					role="group"
					class="relative flex max-w-full items-end justify-end"
				>
					<img
						src={previewUrl}
						alt="Attachment"
						style={getPreviewSize()}
						class="rounded-lg object-contain"
					/>

					{#if subType !== 'sticker' && !isSmallPreview()}
						<button
							onclick={() => {
								fileUtils.downloadFileFromUrl(previewUrl!, name);
							}}
							data-tooltip={$t('common.download')}
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
			<p class="text-center whitespace-pre-line text-red-400">
				{$t('chat.attachment.decrypt-failed-image')}
			</p>
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
				style={getPreviewSize()}
				class="relative flex max-w-full flex-col items-center justify-center rounded-xl bg-gray-500/20"
			>
				<LoadingSpinner />
				<p
					class="text-md absolute bottom-1/8 text-center font-bold whitespace-pre-line text-gray-400"
				>
					{$t('chat.attachment.loading-video', {
						values: { size: fileUtils.formatFileSize(fileSizeBytes) }
					})}
				</p>
			</div>
		{:then previewUrl}
			{#if previewUrl}
				<div style={getPreviewSize()} class="relative">
					<VideoPlayer src={previewUrl} />
					<!-- <video src={previewUrl} controls class="max-h-[600px] max-w-[400px] rounded-lg">
					<track kind="captions" src="" label="No captions available" />
					Your browser does not support the video tag.
				</video> -->

					<button
						onclick={() => {
							fileUtils.downloadFileFromUrl(previewUrl!, name);
						}}
						data-tooltip={$t('common.download')}
						class="absolute top-3 right-3 cursor-pointer rounded-lg bg-gray-500/20 p-1 text-gray-100 hover:text-gray-200"
						aria-label="Download"
					>
						<Icon icon="mdi:tray-download" class="size-6" />
					</button>
				</div>
			{/if}
		{:catch error}
			{console.error(error)}
			<p class="text-center whitespace-pre-line text-red-400">
				{$t('chat.attachment.decrypt-failed-video')}
			</p>
		{/await}
	{/if}
{/snippet}

{#snippet audioPreview(name: string)}
	{#if fileSizeBytes > DOWNLOAD_LIMIT && !ignoreLimit && !fileInIDB}
		{@render ignoreLimitButton(name, fileSizeBytes)}
	{:else}
		{#await getMediaUrl(attachmentPath, keyVersion, name)}
			<div
				style={getPreviewSize()}
				class="relative flex max-w-full flex-col items-center justify-center rounded-xl bg-gray-500/20"
			>
				<LoadingSpinner />
				<p
					class="text-md absolute bottom-1/8 text-center font-bold whitespace-pre-line text-gray-400"
				>
					{$t('chat.attachment.loading-audio', {
						values: { size: fileUtils.formatFileSize(fileSizeBytes) }
					})}
				</p>
			</div>
		{:then previewUrl}
			{#if previewUrl}
				<div style={getPreviewSize()} class="relative max-w-full">
					<AudioPlayer src={previewUrl} title={name} />
					<button
						onclick={() => {
							fileUtils.downloadFileFromUrl(previewUrl!, name);
						}}
						data-tooltip={$t('common.download')}
						class="absolute top-3 right-3 cursor-pointer rounded-lg bg-gray-500/20 p-1 text-gray-100 hover:text-gray-200"
						aria-label="Download"
					>
						<Icon icon="mdi:tray-download" class="size-6" />
					</button>
				</div>
			{/if}
		{:catch error}
			{console.error(error)}
			<p class="text-center whitespace-pre-line text-red-400">
				{$t('chat.attachment.decrypt-failed-audio')}
			</p>
		{/await}
	{/if}
{/snippet}

{#snippet otherPreview(name: string)}
	<div style={getPreviewSize()} class="flex items-center rounded-xl bg-gray-500/40 px-4 py-2 pl-1">
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
			data-tooltip={$t('common.download')}
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
		style={getPreviewSize()}
		class="relative flex max-w-full flex-col items-center justify-center rounded-xl bg-gray-500/20"
	>
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			<button
				onclick={() => {
					ignoreLimit = true;
				}}
				data-tooltip={$t('chat.attachment.ignore-limit')}
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
			data-tooltip={$t('common.download')}
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
