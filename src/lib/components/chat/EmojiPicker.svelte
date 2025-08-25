<script lang="ts">
	import { emojiPickerStore } from '$lib/stores/emojiPicker.svelte';

	let pickerElement: HTMLDivElement;

	let isOpen = $state(false);
	let position = $state({ x: 0, y: 0 });

	const emojiCategories = {
		'😀': [
			'😀',
			'😃',
			'😄',
			'😁',
			'😆',
			'😅',
			'🤣',
			'😂',
			'🙂',
			'🙃',
			'🫠',
			'😉',
			'😊',
			'😇',
			'🥰',
			'😍',
			'🤩',
			'😘',
			'😗',
			'☺️',
			'😚',
			'😙',
			'🥲',
			'😋',
			'😛',
			'😜',
			'🤪',
			'😝',
			'🤑',
			'🤗',
			'🤭',
			'🫢',
			'🫣',
			'🤫',
			'🤔',
			'🫡',
			'🤐',
			'🤨',
			'😐',
			'😑',
			'😶',
			'🫥',
			'😶‍🌫️',
			'😏',
			'😒',
			'🙄',
			'😬',
			'😮‍💨',
			'🤥',
			'🫨',
			'😌',
			'😔',
			'😪',
			'🤤',
			'😴',
			'😷',
			'🤒',
			'🤕',
			'🤢',
			'🤮'
		],
		'🐱': [
			'🐶',
			'🐱',
			'🐭',
			'🐹',
			'🐰',
			'🦊',
			'🐻',
			'🐼',
			'🐻‍❄️',
			'🐨',
			'🐯',
			'🦁',
			'🐮',
			'🐷',
			'🐽',
			'🐸',
			'🐵',
			'🙈',
			'🙉',
			'🙊',
			'🐒',
			'🐔',
			'🐧',
			'🐦',
			'🐤',
			'🐣',
			'🐥',
			'🦆',
			'🦅',
			'🦉',
			'🦇',
			'🐺',
			'🐗',
			'🐴',
			'🦄',
			'🐝',
			'🪱',
			'🐛',
			'🦋',
			'🐌',
			'🐞',
			'🐜',
			'🪰',
			'🪲',
			'🪳',
			'🦟',
			'🦗',
			'🕷️',
			'🕸️',
			'🦂'
		],
		'🍎': [
			'🍎',
			'🍐',
			'🍊',
			'🍋',
			'🍌',
			'🍉',
			'🍇',
			'🍓',
			'🫐',
			'🍈',
			'🍒',
			'🍑',
			'🥭',
			'🍍',
			'🥥',
			'🥝',
			'🍅',
			'🍆',
			'🥑',
			'🥦',
			'🥬',
			'🥒',
			'🌶️',
			'🫑',
			'🌽',
			'🥕',
			'🫒',
			'🧄',
			'🧅',
			'🥔',
			'🍠',
			'🫘',
			'🥐',
			'🍞',
			'🥖',
			'🥨',
			'🧀',
			'🥚',
			'🍳',
			'🧈',
			'🥞',
			'🧇',
			'🥓',
			'🥩',
			'🍗',
			'🍖',
			'🦴',
			'🌭',
			'🍔',
			'🍟'
		],
		'⚽': [
			'⚽',
			'🏀',
			'🏈',
			'⚾',
			'🥎',
			'🎾',
			'🏐',
			'🏉',
			'🥏',
			'🎱',
			'🪀',
			'🏓',
			'🏸',
			'🏒',
			'🏑',
			'🥍',
			'🏏',
			'🪃',
			'🥅',
			'⛳',
			'🪁',
			'🏹',
			'🎣',
			'🤿',
			'🥊',
			'🥋',
			'🎽',
			'🛹',
			'🛼',
			'🛷',
			'⛸️',
			'🥌',
			'🎿',
			'⛷️',
			'🏂',
			'🪂',
			'🏋️',
			'🤸',
			'🤺',
			'⛹️',
			'🤾',
			'🏌️',
			'🏇',
			'🧘',
			'🏃',
			'🚶',
			'🧎',
			'🧍',
			'👫',
			'👬'
		],
		'💻': [
			'⌚',
			'📱',
			'📲',
			'💻',
			'⌨️',
			'🖥️',
			'🖨️',
			'🖱️',
			'🖲️',
			'🕹️',
			'🗜️',
			'💽',
			'💾',
			'💿',
			'📀',
			'📼',
			'📷',
			'📸',
			'📹',
			'🎥',
			'📽️',
			'🎞️',
			'📞',
			'☎️',
			'📟',
			'📠',
			'📺',
			'📻',
			'🎙️',
			'🎚️',
			'🎛️',
			'🧭',
			'⏱️',
			'⏲️',
			'⏰',
			'🕰️',
			'⌛',
			'⏳',
			'📡',
			'🔋',
			'🪫',
			'🔌',
			'💡',
			'🔦',
			'🕯️',
			'🪔',
			'🧯',
			'🛢️',
			'💸',
			'💵'
		],
		'❤️': [
			'❤️',
			'🧡',
			'💛',
			'💚',
			'💙',
			'💜',
			'🖤',
			'🤍',
			'🤎',
			'💔',
			'❤️‍🔥',
			'❤️‍🩹',
			'💕',
			'💞',
			'💓',
			'💗',
			'💖',
			'💘',
			'💝',
			'💟',
			'☮️',
			'✝️',
			'☪️',
			'🕉️',
			'☸️',
			'✡️',
			'🔯',
			'🕎',
			'☯️',
			'☦️',
			'🛐',
			'⛎',
			'♈',
			'♉',
			'♊',
			'♋',
			'♌',
			'♍',
			'♎',
			'♏',
			'♐',
			'♑',
			'♒',
			'♓',
			'🆔',
			'⚛️',
			'🉑',
			'☢️',
			'☣️',
			'📴'
		]
	};

	let activeCategory = $state('😀');
	let searchTerm = $state('');

	const filteredEmojis = $derived.by(() => {
		if (!searchTerm.trim()) {
			return emojiCategories[activeCategory as keyof typeof emojiCategories] || [];
		}

		return Object.values(emojiCategories)
			.flat()
			.filter(() => true); // For now, show all emojis when searching
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

			position = emojiPickerStore.position;
			// Reset search when opening
			searchTerm = '';
			activeCategory = '😀';

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
			bind:this={pickerElement}
			class="fixed flex h-96 w-80 flex-col rounded-lg border border-gray-600 bg-gray-800 shadow-2xl"
			style="left: {adjustedPosition.x}px; top: {adjustedPosition.y}px;"
		>
			<!-- Header with search -->
			<div class="border-b border-gray-700 p-3">
				<input
					type="text"
					placeholder="Search emojis..."
					bind:value={searchTerm}
					class="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
				/>
			</div>

			<!-- Categories -->
			{#if !searchTerm.trim()}
				<div
					class="bg-gray-750 scrollbar-none flex overflow-x-auto border-b border-gray-700 px-3 py-2"
				>
					{#each Object.keys(emojiCategories) as category}
						<button
							class="mx-1 flex-shrink-0 rounded-full px-3 py-1 text-xs whitespace-nowrap transition-colors {activeCategory ===
							category
								? 'bg-blue-600 text-white'
								: 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
							onclick={() => (activeCategory = category)}
						>
							{category}
						</button>
					{/each}
				</div>
			{/if}

			<!-- Emoji grid -->
			<div class="flex-1 overflow-y-auto p-3">
				<div class="grid grid-cols-8 gap-1">
					{#each filteredEmojis as emoji}
						<button
							class="flex h-8 w-8 items-center justify-center rounded text-lg transition-colors hover:bg-gray-700"
							onclick={() => handleEmojiSelect(emoji)}
							title={emoji}
						>
							{emoji}
						</button>
					{/each}
				</div>

				{#if filteredEmojis.length === 0}
					<div class="py-8 text-center text-gray-400">No emojis found</div>
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
