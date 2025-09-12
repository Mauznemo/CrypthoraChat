<script lang="ts">
	import { fileUtils } from '$lib/chat/fileUtils';
	import { decryptFile, decryptFileName } from '$lib/crypto/file';
	import { tryGetFile } from '$lib/fileUpload/upload';
	import LoadingSpinner from '../LoadingSpinner.svelte';

	const {
		attachmentPath,
		keyVersion
	}: {
		attachmentPath: string;
		keyVersion: number;
	} = $props();

	let fileType: 'image' | 'video' | 'audio' | 'other' = $state('other');

	let previewUrl: string | null = $state(null);

	async function decryptName(attachmentPath: string, keyVersion: number) {
		const normalized = attachmentPath.replace(/\\/g, '/');
		const serverFilename = normalized.split('/').pop() || '';
		const filename = serverFilename.split('_')[2]; //uuid_userId_filename
		const encryptedFileNameSafeBase64 = filename.split('.')[0];
		const name = await decryptFileName(encryptedFileNameSafeBase64, keyVersion);
		if (fileUtils.isImageFile(name)) fileType = 'image';
		return name;
	}

	async function getImageURL(attachmentPath: string, keyVersion: number) {
		const result = await tryGetFile(attachmentPath);
		if (!result.success) return;
		const blob = await decryptFile(result.encodedData!, keyVersion);
		previewUrl = URL.createObjectURL(blob);
		return previewUrl;
	}
</script>

<div class="max-w-[400px]">
	<svelte:boundary>
		{#await decryptName(attachmentPath, keyVersion)}
			<div class="mb-2">
				<p class="text-md pr-9 font-bold whitespace-pre-line text-gray-400">Loading...</p>
			</div>
		{:then name}
			<div class="mb-2">
				{#if fileType === 'image'}
					{@render imagePreview()}
				{:else if fileType === 'other'}
					{@render otherPreview(name)}
				{/if}
				<!-- <p class="pr-9 whitespace-pre-line text-gray-200">
				{name}
			</p> -->
			</div>
		{:catch error}
			<!-- {console.error(error)}
			<p class="pr-9 whitespace-pre-line text-red-400">Failed to decrypt file name</p> -->
		{/await}
	</svelte:boundary>
</div>

{#snippet imagePreview()}
	{#await getImageURL(attachmentPath, keyVersion)}
		<div
			class="relative flex h-[300px] w-[400px] flex-col items-center justify-center rounded-xl bg-gray-500/20"
		>
			<LoadingSpinner />
			<p class="text-md absolute bottom-10 text-center font-bold whitespace-pre-line text-gray-400">
				Loading image...
			</p>
		</div>
	{:then previewUrl}
		<img src={previewUrl} alt="Attachment" class="max-[400px] max-h-[600px] rounded-lg" />
	{:catch error}
		{console.error(error)}
		<p class="text-center whitespace-pre-line text-red-400">Failed to decrypt image</p>
	{/await}
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
		<p class="md:text-md line-clamp-1 pr-6 text-sm font-bold break-all text-gray-200">{name}</p>
		<button
			class="absolute right-6 cursor-pointer text-gray-100 hover:text-gray-300"
			aria-label="Download"
		>
			<svg
				class="h-6 w-6"
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
					d="M4 15v2a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-2m-8 1V4m0 12-4-4m4 4 4-4"
				/>
			</svg>
		</button>
	</div>
{/snippet}
