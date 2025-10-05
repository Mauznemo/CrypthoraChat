<script lang="ts">
	import { emojiPickerStore } from '$lib/stores/emojiPicker.svelte';
	import { t } from 'svelte-i18n';
	import { expoInOut } from 'svelte/easing';
	import { scale } from 'svelte/transition';
	import emojiData from 'unicode-emoji-json/data-by-emoji.json';

	let pickerElement: HTMLDivElement;

	let isOpen = $state(false);
	let position = $state({ x: 0, y: 0 });

	let customEmojiSet: string[] = $state([]);
	let searchInput: HTMLInputElement | null = $state(null);

	const emojiCategories: Record<string, string[]> = {};

	for (const [emoji, data] of Object.entries(emojiData)) {
		const category = data.group || 'Other';
		if (!emojiCategories[category]) {
			emojiCategories[category] = [];
		}
		emojiCategories[category].push(emoji);
	}

	const firstCategory = Object.keys(emojiCategories)[0] || '';
	let activeCategory = $state(firstCategory);
	let searchTerm = $state('');
	type EmojiDataType = typeof emojiData;

	const filteredEmojis = $derived.by(() => {
		if (customEmojiSet.length > 0) {
			if (!searchTerm.trim()) {
				return customEmojiSet;
			}
			return customEmojiSet.filter((emoji) => {
				const data = (emojiData as EmojiDataType)[emoji as keyof EmojiDataType];
				if (!data) return false;
				const searchableText = data.name.toLowerCase();
				return searchableText.includes(searchTerm.toLowerCase());
			});
		}

		if (!searchTerm.trim()) {
			return emojiCategories[activeCategory as keyof typeof emojiCategories] || [];
		}

		return Object.values(emojiCategories)
			.flat()
			.filter((emoji) => {
				const data = (emojiData as EmojiDataType)[emoji as keyof EmojiDataType];
				if (!data) return false;
				const searchableText = data.name.toLowerCase();
				return searchableText.includes(searchTerm.toLowerCase());
			});
	});
	function handleEmojiSelect(emoji: string) {
		emojiPickerStore.onSelected?.(emoji);
		searchTerm = ''; // Reset search
		if (emojiPickerStore.closeOnPick) {
			emojiPickerStore.close();
		}
	}

	function handleClickOutside(event: MouseEvent) {
		if (pickerElement && !pickerElement.contains(event.target as Node)) {
			console.log('Clicked outside picker');
			emojiPickerStore.close();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			console.log('Pressed Escape key picker');
			emojiPickerStore.close();
		}
	}

	// Adjust position to keep picker within viewport
	const adjustedPosition = $derived.by(() => {
		if (!isOpen) return { x: 0, y: 0 };

		const pickerWidth = 320;
		const pickerHeight = 400;
		const padding = 16;

		let x = position.x;
		let y = position.y;

		// Adjust horizontal position
		if (x + pickerWidth + padding > window.innerWidth) {
			x = window.innerWidth - pickerWidth - padding;
		}
		if (x < padding) {
			x = padding;
		}

		// Adjust vertical position
		if (y + pickerHeight + padding > window.innerHeight) {
			y = y - pickerHeight - padding;
		}
		if (y < padding) {
			y = padding;
		}

		return { x, y };
	});

	$effect(() => {
		if (emojiPickerStore.isOpen) {
			isOpen = true;
			searchInput?.focus();

			position = emojiPickerStore.position;

			if (emojiPickerStore.customEmojiSet) {
				customEmojiSet = emojiPickerStore.customEmojiSet;
			}
			// Reset search when opening
			searchTerm = '';
			activeCategory = firstCategory;

			console.log('Emoji picker opened');
		} else {
			console.log('Emoji picker closed');
			isOpen = false;
		}
	});
</script>

{#if isOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 bg-transparent"
		onclick={handleClickOutside}
		onkeydown={handleKeydown}
	>
		<div
			in:scale={{ duration: 200, easing: expoInOut }}
			out:scale={{ duration: 200, easing: expoInOut }}
			bind:this={pickerElement}
			class="fixed flex h-96 w-80 flex-col rounded-4xl bg-gray-800/60 frosted-glass-shadow"
			style="left: {adjustedPosition.x}px; top: {adjustedPosition.y}px;"
		>
			<!-- Header with search -->
			<div class="border-b border-gray-700 p-3">
				<input
					bind:this={searchInput}
					type="text"
					placeholder={$t('utils.emoji-picker.search-placeholder')}
					bind:value={searchTerm}
					class="w-full rounded-full border border-gray-700 bg-gray-700/20 px-3 py-2 text-sm text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
				/>
			</div>

			<!-- Categories -->
			{#if !searchTerm.trim() && customEmojiSet.length === 0}
				<div
					class="bg-gray-750 scrollbar-none flex overflow-x-auto border-b border-gray-700 px-3 py-2"
				>
					{#each Object.keys(emojiCategories) as category}
						<button
							class="mx-1 flex-shrink-0 rounded-full px-3 py-1 text-xs whitespace-nowrap transition-colors {activeCategory ===
							category
								? 'bg-blue-600 text-white'
								: 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
							onclick={(e) => {
								activeCategory = category;
								const el = e.target as HTMLElement;

								el.scrollIntoView({
									behavior: 'smooth',
									block: 'nearest',
									inline: 'center'
								});
							}}
						>
							{category}
						</button>
					{/each}
				</div>
			{/if}

			<!-- Emoji grid -->
			<div class="no-scrollbar flex-1 overflow-y-auto p-3">
				<div class="grid grid-cols-8 gap-1">
					{#each filteredEmojis as emoji}
						<button
							class="flex size-10 items-center justify-center rounded text-2xl transition-colors hover:bg-gray-700"
							onclick={() => handleEmojiSelect(emoji)}
						>
							{emoji}
						</button>
					{/each}
				</div>

				{#if filteredEmojis.length === 0}
					<div class="py-8 text-center text-gray-400">{$t('utils.emoji-picker.no-results')}</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.scrollbar-none {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.scrollbar-none::-webkit-scrollbar {
		display: none;
	}
</style>
