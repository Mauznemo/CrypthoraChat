<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		favoriteUserSticker,
		getUserStickers,
		unfavoriteUserSticker
	} from '$lib/chat/stickers.remote';
	import { decryptFile } from '$lib/crypto/file';
	import { tryGetFile } from '$lib/fileUpload/upload';
	import { getFileFromIDB, saveFileToIDB } from '$lib/idb';
	import { contextMenuStore, type ContextMenuItem } from '$lib/stores/contextMenu.svelte';
	import type { Prisma } from '$prisma';
	import Icon from '@iconify/svelte';
	import e from 'cors';
	import { tick } from 'svelte';
	import { expoInOut } from 'svelte/easing';
	import { scale } from 'svelte/transition';
	type ServerSticker = Prisma.UserStickerGetPayload<{
		select: {
			id: true;
			stickerPath: true;
			favorited: true;
		};
	}>;

	interface Sticker {
		id: string;
		previewUrl: string;
		favorited: boolean;
	}

	let isOpen = $state(false);
	let stickersPaths: ServerSticker[] = $state([]);

	let stickers: Sticker[] = $state([]);

	export async function open(): Promise<void> {
		isOpen = true;
		stickersPaths = await getUserStickers();

		stickers = [];

		for (const sticker of stickersPaths) {
			const previewUrl = await getMediaUrl(sticker.stickerPath);
			if (!previewUrl) continue;
			if (sticker.favorited) {
				stickers.unshift({
					id: sticker.id,
					previewUrl,
					favorited: sticker.favorited
				});
			} else {
				stickers.push({
					id: sticker.id,
					previewUrl,
					favorited: sticker.favorited
				});
			}

			await tick();
		}
	}

	async function getMediaUrl(attachmentPath: string) {
		console.log('getMediaUrl', attachmentPath);

		const retrievedBlob = await getFileFromIDB(attachmentPath);

		let blob: Blob;
		let previewUrl: string;

		if (retrievedBlob) {
			previewUrl = URL.createObjectURL(retrievedBlob);
			blob = retrievedBlob;
			console.log('retrievedBlob');
		} else {
			const result = await tryGetFile(attachmentPath);
			if (!result.success) return;
			blob = await decryptFile(result.encodedData!, -1, 'master');
			console.log('decryptFile');
			previewUrl = URL.createObjectURL(blob);
			await saveFileToIDB(attachmentPath, blob);
			console.log('saveFileToIDB');
		}

		console.log('previewUrl', previewUrl);

		return previewUrl;
	}

	function handleContextMenu(event: Event, sticker: Sticker): void {
		event.preventDefault();

		const items: ContextMenuItem[] = [
			{
				id: 'delete',
				label: 'Delete',
				icon: 'mdi:delete',
				action: () => {}
			}
		];
		if (sticker.favorited) {
			items.unshift({
				id: 'unfavorite',
				label: 'Unfavorite',
				icon: 'mdi:star-outline',
				action: () => {
					favoriteSticker(sticker, false);
				}
			});
		} else {
			items.unshift({
				id: 'favorite',
				label: 'Favorite',
				icon: 'mdi:star',
				action: () => {
					favoriteSticker(sticker, true);
				}
			});
		}
		contextMenuStore.openAtCursor(items);
	}

	async function favoriteSticker(sticker: Sticker, favorited: boolean): Promise<void> {
		sticker.favorited = favorited;
		if (sticker.favorited) {
			await favoriteUserSticker(sticker.id);
		} else {
			await unfavoriteUserSticker(sticker.id);
		}
	}

	function handleFavoriteToggle(event: Event, sticker: Sticker): void {
		event.stopPropagation();
		favoriteSticker(sticker, !sticker.favorited);
	}
</script>

{#if isOpen}
	<div
		in:scale={{ duration: 200, easing: expoInOut }}
		out:scale={{ duration: 200, easing: expoInOut }}
		class="absolute bottom-20 z-10 w-[90%] md:w-[50%]"
	>
		<div
			class="mini-scrollbar flex h-[300px] w-full flex-wrap items-start justify-start gap-4 overflow-y-auto rounded-2xl bg-gray-600/60 p-6 frosted-glass"
		>
			<button
				onclick={() => goto('/sticker-editor')}
				class="flex size-24 cursor-pointer flex-col items-center justify-center rounded-lg bg-gray-800/60 hover:bg-gray-800/40"
			>
				<div
					class="flex h-12 w-12 items-center justify-center rounded-full bg-gray-600 frosted-glass"
				>
					<Icon icon="mdi:sticker-plus-outline" class="size-6" />
				</div>
				<p>Create</p>
			</button>
			<button
				onclick={() => goto('/sticker-importer')}
				class="flex size-24 cursor-pointer flex-col items-center justify-center rounded-lg bg-gray-800/60 hover:bg-gray-800/40"
			>
				<div
					class="flex h-12 w-12 items-center justify-center rounded-full bg-gray-600 frosted-glass"
				>
					<Icon icon="mdi:import" class="size-6" />
				</div>
				<p>Import</p>
			</button>
			{#each stickers as sticker}
				<button
					oncontextmenu={(e) => handleContextMenu(e, sticker)}
					class="relative size-24 cursor-pointer rounded-lg bg-gray-800/60 hover:bg-gray-800/40"
				>
					<img class="pointer-events-none" src={sticker.previewUrl} alt="Sticker" />
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<span
						class="absolute top-1 right-1"
						onclick={(e) => handleFavoriteToggle(e, sticker)}
						role="button"
						tabindex="0"
					>
						{#if sticker.favorited}
							<Icon icon="mdi:star" class="size-6 hover:text-gray-400" />
						{:else}
							<Icon icon="mdi:star-outline" class="size-6 hover:text-yellow-400" />
						{/if}
					</span>
				</button>
			{/each}
		</div>
		<button class="absolute top-2 right-2 cursor-pointer" onclick={() => (isOpen = false)}>
			<Icon icon="mdi:close" class="size-6" />
		</button>
	</div>
{/if}
