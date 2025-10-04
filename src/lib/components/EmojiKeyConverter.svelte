<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { emojiPickerStore } from '$lib/stores/emojiPicker.svelte';
	import { emojiKeyConverterStore } from '$lib/stores/emojiKeyConverter.svelte';
	import { fade, scale } from 'svelte/transition';
	import { expoInOut } from 'svelte/easing';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { arrayBufferToBase64, base64ToArrayBuffer } from '$lib/crypto/utils';
	import Icon from '@iconify/svelte';
	import emojiData from 'unicode-emoji-json/data-by-emoji.json';
	import { t } from 'svelte-i18n';

	type EmojiDataType = typeof emojiData;

	let mode: 'display' | 'input' = $state('input');
	let base64Seed: string;
	let emojiRawInput = $state('');

	// prettier-ignore
	const EMOJI_SET = Object.freeze([
		'🦋', '🐊', '🦎', '🍁', '🔋', '⛄', '🥜', '😂', '🙂', '🙃', '🚜', '😉', '🍔', '😇', '🥰', '😍',
		'🤩', '😘', '🔋', '🍀', '☘️', '🥝', '🍓', '🛵', '🎁', '🤪', '🍕', '🤑', '🤗', '🍩', '🍪', '🫣',
		'🌛', '🎣', '🫡', '🏆', '🍇', '🍆', '🥔', '🍌', '🫥', '⏰', '⛸️', '🎰', '🍷', '⛲', '🍉', '🍿',
		'🕯️', '🚀', '😴', '🍫', '📖', '🎄', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳',
		'🥸', '😎', '🤓', '🌵', '🥁', '🔔', '🍺', '🎮', '🌍', '⌨️', '🎞️', '⚓', '🚆', '🚽', '☂️', '🎙️',
		'💰', '😥', '📦', '😭', '😱', '🐳', '🐛', '🐞', '🐝', '🕸️', '🌷', '🥱', '🚠', '😡', '🛰️', '🚁',
		'😈', '✈️', '💀', '💩', '🤡', '🚢', '👺', '👻', '👽', '👾', '🤖', '🎃', '😺', '🚓', '😹', '😻',
		'😼', '😽', '🙀', '💉', '🔨', '🙈', '🙉', '🦀', '💋', '💌', '💘', '💝', '🦆', '💗', '💓', '💞',
		'💕', '💟', '💔', '🐦', '🐧', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '❤️', '🔥', '⚔️', '⭐',
		'🔦', '✨', '⚡', '☄️', '💥', '💢', '💯', '💨', '💦', '💤', '🕳️', '👁️', '🗨️', '💭', '🗯️', '🚒',
		'👋', '🤚', '🐭', '🦇', '🐼', '👌', '🤌', '🤏', '✌️', '🚧', '🐮', '🤟', '🐏', '🐖', '👈', '👉',
		'👆', '🥐', '👇', '🔑', '🫵', '👍', '👎', '👊', '🚬', '🤛', '🤜', '👏', '🚥', '🫶', '👐', '🛒',
		'🤝', '🙏', '✍️', '💅', '🤳', '💪', '🐪', '🦄', '🦵', '🦶', '👂', '⚙️', '👃', '🧠', '🫀', '🫁',
		'🦷', '🦴', '👀', '👅', '👄', '🐯', '💳', '📌', '✏️', '💎', '💄', '🎩', '🎒', '👜', '👗', '👖',
		'🎺', '📎', '🎲', '✂️', '🙅', '🗿', '👕', '🙋', '👓', '🏇', '🏊', '🤷', '👮', '💵', '📷', '🥷',
		'🐘', '📻', '🎵', '👸', '❄️', '🎹', '🖨️', '🏎️', '🔧', '⛷️', '🗑️', '👨‍🏫', '🏃‍♀️', '☎️', '🎅', '🎧',
	]);

	//const EMOJI_SET = EMOJI_SET_NON_NORMALIZED.map((emoji) => removeAdditionalDataFromEmoji(emoji));

	let emojiSequence = $state<string[]>([]);
	let displayEmojis = $state<string[]>([]);
	let inputIndex = $state(0);

	function getDateSalt(): Uint8Array {
		if (!emojiKeyConverterStore.useDateSalt) return new Uint8Array(0);

		const todayUTC = new Date();
		const dateString =
			todayUTC.getUTCFullYear().toString().padStart(4, '0') +
			'-' +
			(todayUTC.getUTCMonth() + 1).toString().padStart(2, '0') +
			'-' +
			todayUTC.getUTCDate().toString().padStart(2, '0');

		const encoder = new TextEncoder();
		return encoder.encode(dateString);
	}

	function getSaltTimeRemaining(): string {
		const now = new Date();

		const nextMidnight = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
		);

		const diffMs = nextMidnight.getTime() - now.getTime();

		// Convert to hours and minutes
		const diffMinutes = Math.floor(diffMs / (1000 * 60));
		const hours = Math.floor(diffMinutes / 60);
		const minutes = diffMinutes % 60;

		return $t('utils.emoji-key-converter.time-remaining', {
			values: {
				hours: hours.toString().padStart(1, '0'),
				minutes: minutes.toString().padStart(2, '0')
			}
		});
	}

	export function removeAdditionalDataFromEmoji(emoji: string): string {
		// Remove variation selectors (U+FE0E and U+FE0F) to get the base emoji
		return emoji.replace(/[\uFE0E\uFE0F]/g, '');
	}

	export async function seedToEmojiSequence(base64Seed: string): Promise<string[]> {
		if (!base64Seed) {
			throw new Error('Seed not found.');
		}
		console.log('In Seed:', base64Seed);
		const seedBytes = new Uint8Array(base64ToArrayBuffer(base64Seed));
		const dateSalt = getDateSalt();
		const saltArray = new Uint8Array(dateSalt);

		// Derive a 16-byte mask from dateSalt (SHA-256 then slice to 16 bytes)
		const saltHashBuffer = await crypto.subtle.digest('SHA-256', saltArray);
		const saltHash = new Uint8Array(saltHashBuffer).slice(0, 16);
		console.log('Date salt:', arrayBufferToBase64(saltArray.buffer));

		// XOR seed with saltHash to create temporary bytes
		const tempBytes = new Uint8Array(16);
		for (let i = 0; i < 16; i++) {
			tempBytes[i] = seedBytes[i] ^ saltHash[i];
		}

		// Map to emojis
		const emojis: string[] = [];
		for (let i = 0; i < 16; i++) {
			emojis.push(EMOJI_SET[tempBytes[i]]);
		}

		const indices = emojis.map((emoji) => EMOJI_SET.indexOf(emoji));

		console.log('Emoji sequence:', emojis);
		//console.log('Normalized emojis:', normalizedEmojis);
		console.log('Emoji indices:', indices);

		return emojis;
	}

	export async function emojiSequenceToSeed(emojis: string[]): Promise<string> {
		if (emojis.length !== 16) {
			throw new Error('Invalid emoji sequence length.');
		}

		//const normalizedEmojis = emojis.map(removeAdditionalDataFromEmoji);
		const indices = emojis.map((emoji) => EMOJI_SET.indexOf(emoji));

		console.log('Emoji sequence:', emojis);
		//console.log('Normalized emojis:', normalizedEmojis);
		console.log('Emoji indices:', indices);

		const tempBytes = new Uint8Array(16);
		for (let i = 0; i < 16; i++) {
			tempBytes[i] = indices[i];
		}

		const dateSalt = getDateSalt();
		const saltArray = new Uint8Array(dateSalt);
		console.log('Date salt:', arrayBufferToBase64(saltArray.buffer));

		// Derive the same 16-byte mask from dateSalt
		const saltHashBuffer = await crypto.subtle.digest('SHA-256', saltArray);
		const saltHash = new Uint8Array(saltHashBuffer).slice(0, 16);

		// Recover seed by XOR with saltHash
		const seedBytes = new Uint8Array(16);
		for (let i = 0; i < 16; i++) {
			seedBytes[i] = tempBytes[i] ^ saltHash[i];
		}

		const base64Seed = arrayBufferToBase64(seedBytes.buffer);
		console.log('Recovered seed:', base64Seed);
		return base64Seed;
	}

	// Handle emoji selection in input mode
	function handleEmojiSelect(emoji: string) {
		if (mode === 'input' && inputIndex < 16) {
			emojiSequence[inputIndex] = emoji;
			inputIndex++;

			// Generate key when sequence is complete
			if (inputIndex === 16) {
				generateKeyFromSequence();
			}
		}
	}

	// Generate key from completed emoji sequence
	async function generateKeyFromSequence() {
		try {
			const seed = await emojiSequenceToSeed(emojiSequence);
			emojiKeyConverterStore.onDone?.(seed);
		} catch (error) {
			modalStore.error(error, $t('utils.emoji-key-converter.failed-to-generate-key'));
			console.error('Failed to generate key from emoji sequence:', error);
		}
	}

	// Clear input sequence
	function clearSequence() {
		emojiSequence = [];
		inputIndex = 0;
	}

	// Remove last emoji in input mode
	function removeLastEmoji() {
		if (inputIndex > 0) {
			inputIndex--;
			emojiSequence[inputIndex] = '';
		}
	}

	function openEmojiPicker(event: MouseEvent) {
		if (mode === 'input') {
			emojiPickerStore.open(event.target as HTMLElement, handleEmojiSelect, [...EMOJI_SET].sort());
		}
	}

	async function updateDisplay(seed: string) {
		displayEmojis = await seedToEmojiSequence(seed);
	}

	onMount(() => {
		emojiKeyConverterStore.clearInput = clearSequence;
	});

	// Update display when key changes
	$effect(() => {
		if (emojiKeyConverterStore.isOpen) {
			emojiSequence = [];
			inputIndex = 0;
			console.log('Opened emoji key converter');
			mode = emojiKeyConverterStore.base64Seed ? 'display' : 'input';
			console.log('Mode:', mode);
			if (emojiKeyConverterStore.base64Seed) base64Seed = emojiKeyConverterStore.base64Seed;
			if (mode === 'display' && base64Seed) {
				updateDisplay(base64Seed);
			}
		}
	});

	// Reactive computed values
	//const emojisToShow = $derived(mode === 'display' ? displayEmojis : emojiSequence);
	// const isComplete = $derived(mode === 'input' && inputIndex === 16);
	const progress = $derived(mode === 'input' ? (inputIndex / 16) * 100 : 100);
</script>

{#if emojiKeyConverterStore.isOpen}
	<div
		in:fade={{ duration: 200 }}
		out:fade={{ duration: 200 }}
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
	>
		<div
			in:scale={{ duration: 200, easing: expoInOut }}
			out:scale={{ duration: 200, easing: expoInOut }}
			class="mx-2 w-full max-w-md rounded-4xl bg-gray-800/60 p-4 frosted-glass-shadow"
		>
			<button
				onclick={() => emojiKeyConverterStore.close()}
				class="absolute right-5 cursor-pointer p-1 text-gray-400 transition-colors hover:text-gray-200"
				aria-label="Close modal"
			>
				<Icon icon="mdi:close" class="size-6" />
			</button>
			{#if mode === 'display'}
				<!-- <p class="text-white">Emojies: {displayEmojis.toString()}</p> -->
				<h3 class="mt-2 mb-5 text-lg font-semibold text-white">
					{emojiKeyConverterStore.title}
				</h3>
				<div class="space-y-4">
					<div
						class="emoji-consistent grid grid-cols-4 justify-items-center gap-3 px-0 select-none"
					>
						{#each displayEmojis as emoji, index}
							{@const data = (emojiData as EmojiDataType)[emoji as keyof EmojiDataType]}
							<div
								class="flex h-24 w-22 flex-col items-center justify-center gap-1 rounded-lg border-2 border-gray-600 text-4xl transition-colors"
							>
								{emoji}
								<p
									class="px-0.5 text-center {data.name.length > 20
										? 'text-xs'
										: 'text-sm'} leading-tight break-words text-gray-400"
								>
									{data.name}
								</p>
							</div>
						{/each}
					</div>
				</div>
				{#if emojiKeyConverterStore.useDateSalt}
					<p class="mt-3 text-center text-sm text-gray-400">
						{$t('utils.emoji-key-converter.expires-in-date', {
							values: { time: getSaltTimeRemaining() }
						})}
					</p>
				{/if}
			{:else}
				<!-- <input type="text" bind:value={emojiRawInput} />
				<button
					onclick={() => {
						emojiSequence = emojiRawInput.split(',');
						inputIndex = emojiSequence.length;
						generateKeyFromSequence();
					}}>Fill</button
				> -->
				<div>
					<div class="mb-6">
						<h3 class="mt-2 mb-5 text-lg font-semibold text-white">
							{emojiKeyConverterStore.title}
						</h3>
						<div class="h-2 w-full overflow-hidden rounded-full bg-gray-700">
							<div
								class="h-full bg-accent-500 transition-all duration-300 ease-out"
								style="width: {progress}%"
							></div>
						</div>
						<p class="mt-1 text-sm text-gray-400">
							{$t('utils.emoji-key-converter.input-progress', { values: { index: inputIndex } })}
						</p>
					</div>

					<div class="grid grid-cols-4 justify-items-center gap-3">
						{#each Array(16) as _, index}
							{@const data = emojiSequence[index]
								? (emojiData as EmojiDataType)[emojiSequence[index] as keyof EmojiDataType]
								: { name: '' }}
							<button
								class="flex h-24 w-22 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-gray-600 text-4xl transition-colors hover:border-blue-400 hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
								class:filled={emojiSequence[index]}
								class:active={index === inputIndex}
								onclick={openEmojiPicker}
								disabled={index > inputIndex}
							>
								{emojiSequence[index] || '❓'}
								<p
									class="px-0.5 text-center {data.name.length > 20
										? 'text-xs'
										: 'text-sm'} leading-tight break-words text-gray-400"
								>
									{data.name}
								</p>
							</button>
						{/each}
					</div>

					<div class="mt-6 flex flex-wrap justify-center gap-2">
						<button
							class="cursor-pointer rounded-full bg-yellow-600/40 px-4 py-2 text-sm font-medium text-white frosted-glass transition-colors hover:bg-yellow-500/40 disabled:cursor-not-allowed disabled:opacity-50"
							onclick={removeLastEmoji}
							disabled={inputIndex === 0}
						>
							{$t('utils.emoji-key-converter.remove-last')}
						</button>
						<button
							class="cursor-pointer rounded-full bg-red-800/40 px-4 py-2 text-sm font-medium text-white frosted-glass transition-colors hover:bg-red-600/40 disabled:cursor-not-allowed disabled:opacity-50"
							onclick={clearSequence}
							disabled={inputIndex === 0}
						>
							{$t('utils.emoji-key-converter.clear')}
						</button>
						<button
							class="cursor-pointer rounded-full bg-accent-700/60 px-4 py-2 text-sm font-medium text-white frosted-glass transition-colors hover:bg-accent-600/50 disabled:cursor-not-allowed disabled:opacity-50"
							onclick={openEmojiPicker}
							disabled={inputIndex >= 16}
						>
							{$t('utils.emoji-key-converter.add-emoji')}
						</button>
					</div>

					<!-- {#if isComplete}
						<div class=" mt-4 rounded-3xl bg-green-900/60 p-3 text-center">
							<span class="text-green-600 dark:text-green-400"
								>✓ Sequence complete! Key generated.</span
							>
						</div>
					{/if} -->
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	/*
	.input-cell.filled {
		@apply 
	}

	.input-cell.active {
		@apply border-blue-500 bg-blue-100 ring-2 ring-blue-300 dark:bg-blue-800;
	}
*/
</style>
