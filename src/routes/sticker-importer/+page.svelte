<script lang="ts">
	import { goto } from '$app/navigation';

	import { modalStore } from '$lib/stores/modal.svelte';
	import type { PageProps } from './$types';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import { saveUserSticker } from '../sticker-editor/stickerEditor.remote';
	import { tryUploadUserSticker } from '$lib/fileUpload/upload';
	import { tick } from 'svelte';
	import { t } from 'svelte-i18n';

	let { data }: PageProps = $props();

	let loading = $state(false);
	let fileInput: HTMLInputElement;
	let selectedFiles: File[] = $state([]);
	let fileSizes: number[] = $state([]);
	let failedSelections: number = $state(0);
	let uploadedFiles: number = $state(0);
	let percentage: number = $state(-1);

	async function handleImport() {
		if (loading) return;
		try {
			loading = true;
			percentage = 0;
			for (let i = 0; i < selectedFiles.length; i++) {
				const file = selectedFiles[i];
				const result = await tryUploadUserSticker(file);

				if (result.success) {
					await saveUserSticker(result.filePath);
				}
				uploadedFiles++;
				percentage = Math.round((uploadedFiles / selectedFiles.length) * 100);
				await tick();
			}
			loading = false;
			goto('/chat');
		} catch (err: any) {
			loading = false;
			modalStore.error(err, $t('chat.new.failed-to-import-stickers'));
		}
	}

	async function handleFilesSelect(event: Event): Promise<void> {
		if (loading) return;
		const target = event.target as HTMLInputElement;
		const files = target.files;
		if (files) {
			for (let i = 0; i < files.length; i++) {
				handleFileSelect(files[i]);
				await tick();
			}
		}
	}

	function handleFileSelect(file: File): void {
		console.log(file);
		if (file.type === 'image/webp' && file.size <= 1024 * 1024) {
			selectedFiles.push(file);
			fileSizes.push(file.size);
		} else {
			failedSelections++;
		}
	}
</script>

<div class="flex min-h-dvh items-center justify-center">
	<div
		class="m-4 flex w-full max-w-[500px] flex-col items-stretch rounded-4xl bg-gray-800/60 frosted-glass-shadow"
	>
		<div class="my-5 flex items-center gap-2 px-5 lg:my-8">
			<BackButton backPath="/chat" />
			<h1 class="mx-5 text-center text-2xl font-bold lg:text-4xl">
				{$t('utils.sticker-importer.import-stickers')}
			</h1>
		</div>

		<div class="m-10 flex flex-col items-center gap-4 text-center">
			{#if selectedFiles.length > 0}
				<p class="text-xl font-bold">
					{$t('utils.sticker-importer.stickers-selected', {
						values: { count: selectedFiles.length }
					})}
				</p>
			{:else}
				<p class="text-xl font-bold">{$t('utils.sticker-importer.no-stickers-selected')}</p>
			{/if}
			{#if failedSelections > 0}
				<p class="text-lg font-bold text-red-300">
					{$t('utils.sticker-importer.stickers-failed', { values: { count: failedSelections } })}
				</p>
			{/if}
			<p class="text-lg text-gray-300">{@html $t('utils.sticker-importer.select-description')}</p>
			<button
				onclick={() => fileInput.click()}
				class="cursor-pointer rounded-full bg-accent-700/60 px-8 py-2 font-semibold frosted-glass transition-colors hover:bg-accent-600/50"
			>
				{$t('utils.sticker-importer.select-stickers')}
			</button>
		</div>

		<button
			onclick={handleImport}
			disabled={selectedFiles.length < 1}
			style={percentage === -1
				? ''
				: `background: linear-gradient(to right, oklch(from var(--color-accent-700) l c h / 0.6) 0%, oklch(from var(--color-accent-700) l c h / 0.6) ${percentage}%, oklch(from var(--color-neutral-700) l c h / 0.6) ${percentage}%, oklch(from var(--color-neutral-700) l c h / 0.6) 100%);`}
			class="{percentage === -1
				? 'bg-accent-700/60 hover:bg-accent-600/50'
				: ''} m-10 mt-7 cursor-pointer rounded-full px-8 py-4 font-semibold frosted-glass transition-colors hover:brightness-110 disabled:bg-gray-600/60 disabled:text-gray-400 disabled:hover:brightness-100"
		>
			{#if loading}
				<LoadingSpinner size="1.5rem" />
			{:else}
				{$t('utils.sticker-importer.start-import')}
			{/if}
		</button>
	</div>
</div>

<input
	class="hidden"
	type="file"
	accept="image/webp"
	multiple
	bind:this={fileInput}
	onchange={handleFilesSelect}
/>
