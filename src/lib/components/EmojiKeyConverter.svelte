<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { emojiPickerStore } from '$lib/stores/emojiPicker.svelte';
	import { emojiKeyConverterStore } from '$lib/stores/emojiKeyConverter.svelte';
	import { fade, scale } from 'svelte/transition';
	import { expoInOut } from 'svelte/easing';

	/*interface Props {
		mode: 'display' | 'input';
		chatKey?: CryptoKey;
		onKeyGenerated?: (key: CryptoKey) => void;
		useDateSalt?: boolean;
		class?: string;
		children?: Snippet;
	}

	let {
		mode,
		chatKey,
		onKeyGenerated,
		useDateSalt = false,
		class: className = '',
		children
	}: Props = $props();*/

	let mode: 'display' | 'input' = $state('input');
	let base64Seed: string;
	let isOpen = $state(false);
	let emojiRawInput = $state('');

	// Comprehensive emoji set for key representation
	// prettier-ignore
	const EMOJI_SET = [
		'🦋', '🐊', '🦎', '🍁', '🔋', '⛄', '🥜', '😂', '🙂', '🙃', '🚜', '😉', '🍔', '😇', '🥰', '😍',
		'🤩', '😘', '🔋', '🍀', '☘️', '🥝', '🍓', '🛵', '🎁', '🤪', '🍕', '🤑', '🤗', '🍩', '🍪', '🫣',
		'🌛', '🎣', '🫡', '🤐', '🍇', '🍆', '🥔', '🍌', '🫥', '⏰', '⛸️', '🎰', '🍷', '⛲', '🍉', '🍿',
		'🕯️', '🚀', '😴', '🍫', '🤒', '🎄', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳',
		'🥸', '😎', '🤓', '🌵', '🥁', '🔔', '🍺', '🎮', '🌍', '⌨️', '🎞️', '⚓', '🚆', '🚽', '☂️', '😨',
		'💰', '😥', '📦', '😭', '😱', '🐳', '🐛', '🐞', '🐝', '🕸️', '🌷', '🥱', '🚠', '😡', '🛰️', '🚁',
		'😈', '✈️', '💀', '💩', '🤡', '🚢', '👺', '👻', '👽', '👾', '🤖', '🎃', '😺', '🚓', '😹', '😻',
		'😼', '😽', '🙀', '😿', '😾', '🙈', '🙉', '🦀', '💋', '💌', '💘', '💝', '🦆', '💗', '💓', '💞',
		'💕', '💟', '💔', '🐦', '🐧', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '❤️', '🔥', '💫', '⭐',
		'🌟', '✨', '⚡', '☄️', '💥', '💢', '💯', '💨', '💦', '💤', '🕳️', '👁️', '🗨️', '💭', '🗯️', '🚒',
		'👋', '🤚', '🐭', '🦇', '🐼', '👌', '🤌', '🤏', '✌️', '🚧', '🐮', '🤟', '🐏', '🐖', '👈', '👉',
		'👆', '🥐', '👇', '🔑', '🫵', '👍', '👎', '👊', '🚬', '🤛', '🤜', '👏', '🚥', '🫶', '👐', '🛒',
		'🤝', '🙏', '✍️', '💅', '🤳', '💪', '🐪', '🦄', '🦵', '🦶', '👂', '⚙️', '👃', '🧠', '🫀', '🫁',
		'🦷', '🦴', '👀', '👅', '👄', '🐯', '👶', '🧒', '👦', '💎', '💄', '🎩', '🎒', '👜', '👗', '👖',
		'👴', '👵', '🙍', '🙎', '🙅', '🙆', '👕', '🙋', '👓', '🏇', '🏊', '🤷', '👮', '🕵️', '💂', '🥷',
		'🐘', '🫅', '🤴', '👸', '👳', '👲', '🧕', '🏎️', '👰', '⛷️', '🫃', '👨‍🏫', '🏃‍♀️', '👼', '🎅', '🤶',
		'🔧', '📎', '✂️', '🗑️', '☢️', '🗿', '💉', '🔨', '📌', '✏️', '💵', '🔦', '📷', '🖨️', '☎️', '🎧',
		'🔭', '🎺', '🎙️', '🎵', '🎲', '❄️', '🏆', '📻', '🎹', '📖', '💳', '🗜️', '⛔', '⚔️', '🔫', '🔍',
	];

	let emojiSequence = $state<string[]>([]);
	let displayEmojis = $state<string[]>([]);
	let inputIndex = $state(0);

	// Convert array buffer to base64
	function arrayBufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let binary = '';
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	// Convert base64 to array buffer
	function base64ToArrayBuffer(base64: string): ArrayBuffer {
		const binaryString = atob(base64);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return bytes.buffer;
	}

	// Get date salt if enabled
	function getDateSalt(): Uint8Array {
		if (!emojiKeyConverterStore.useDateSalt) return new Uint8Array(0);

		const today = new Date();
		const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
		const encoder = new TextEncoder();
		return encoder.encode(dateString);
	}

	// Convert seed to emoji sequence for sharing (call this on the first device to display/share)
	// Incorporates dateSalt to make it day-bound if dateSalt is non-empty
	export async function seedToEmojiSequence(base64Seed: string): Promise<string[]> {
		if (!base64Seed) {
			throw new Error('Seed not found.');
		}
		const seedBytes = new Uint8Array(base64ToArrayBuffer(base64Seed));
		const dateSalt = getDateSalt();
		const saltArray = new Uint8Array(dateSalt);

		// Derive a 16-byte mask from dateSalt (SHA-256 then slice to 16 bytes)
		const saltHashBuffer = await crypto.subtle.digest('SHA-256', saltArray);
		const saltHash = new Uint8Array(saltHashBuffer).slice(0, 16);

		// XOR seed with saltHash to create temporary bytes
		const tempBytes = new Uint8Array(16);
		for (let i = 0; i < 16; i++) {
			tempBytes[i] = seedBytes[i] ^ saltHash[i];
		}

		// Map to emojis (assumes EMOJI_SET has at least 256 emojis)
		const emojis: string[] = [];
		for (let i = 0; i < 16; i++) {
			emojis.push(EMOJI_SET[tempBytes[i]]);
		}

		return emojis;
	}

	// Import from emoji sequence and store seed (run on new device after user inputs emojis)
	// Recovers the seed using dateSalt and stores it
	export async function emojiSequenceToSeed(emojis: string[]): Promise<string> {
		if (emojis.length !== 16) {
			throw new Error('Invalid emoji sequence length.');
		}

		const indices = emojis.map((emoji) => EMOJI_SET.indexOf(emoji));
		if (indices.some((idx) => idx === -1 || idx > 255)) {
			throw new Error('Invalid emoji in sequence.');
		}

		const tempBytes = new Uint8Array(16);
		for (let i = 0; i < 16; i++) {
			tempBytes[i] = indices[i];
		}

		const dateSalt = getDateSalt();
		const saltArray = new Uint8Array(dateSalt);

		// Derive the same 16-byte mask from dateSalt
		const saltHashBuffer = await crypto.subtle.digest('SHA-256', saltArray);
		const saltHash = new Uint8Array(saltHashBuffer).slice(0, 16);

		// Recover seed by XOR with saltHash
		const seedBytes = new Uint8Array(16);
		for (let i = 0; i < 16; i++) {
			seedBytes[i] = tempBytes[i] ^ saltHash[i];
		}

		const base64Seed = arrayBufferToBase64(seedBytes.buffer);
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

	// Open emoji picker
	function openEmojiPicker(event: MouseEvent) {
		if (mode === 'input') {
			emojiPickerStore.open(event.target as HTMLElement, handleEmojiSelect, EMOJI_SET.sort());
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
	const isComplete = $derived(mode === 'input' && inputIndex === 16);
	const progress = $derived(mode === 'input' ? (inputIndex / 16) * 100 : 100);
</script>

{#if emojiKeyConverterStore.isOpen}
	<div
		in:fade={{ duration: 200 }}
		out:fade={{ duration: 200 }}
		class="fixed inset-0 z-30 flex items-center justify-center bg-black/50"
	>
		<div
			in:scale={{ duration: 200, easing: expoInOut }}
			out:scale={{ duration: 200, easing: expoInOut }}
			class="frosted-glass-shadow mx-2 w-full max-w-md rounded-4xl bg-gray-800/60 p-4"
		>
			<button
				onclick={() => emojiKeyConverterStore.close()}
				class="absolute right-5 p-1 text-gray-400 transition-colors hover:text-gray-200"
				aria-label="Close modal"
			>
				<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					></path>
				</svg>
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
							<div
								class="flex size-18 items-center justify-center rounded-lg border-2 border-gray-600 text-4xl transition-colors"
							>
								{emoji}
							</div>
						{/each}
					</div>
				</div>
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
								class="h-full bg-teal-500 transition-all duration-300 ease-out"
								style="width: {progress}%"
							></div>
						</div>
						<p class="mt-1 text-sm text-gray-400">
							{inputIndex}/16 emojis entered
						</p>
					</div>

					<div class="grid grid-cols-4 justify-items-center gap-3">
						{#each Array(16) as _, index}
							<button
								class="flex size-18 cursor-pointer items-center justify-center rounded-lg border-2 border-gray-600 text-4xl transition-colors hover:border-blue-400 hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
								class:filled={emojiSequence[index]}
								class:active={index === inputIndex}
								onclick={openEmojiPicker}
								disabled={index > inputIndex}
							>
								{emojiSequence[index] || '❓'}
							</button>
						{/each}
					</div>

					<div class="mt-6 flex flex-wrap justify-center gap-2">
						<button
							class="frosted-glass cursor-pointer rounded-full bg-yellow-600/40 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-yellow-500/40 disabled:cursor-not-allowed disabled:opacity-50"
							onclick={removeLastEmoji}
							disabled={inputIndex === 0}
						>
							Remove Last
						</button>
						<button
							class="frosted-glass cursor-pointer rounded-full bg-red-600/40 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500/40 disabled:cursor-not-allowed disabled:opacity-50"
							onclick={clearSequence}
							disabled={inputIndex === 0}
						>
							Clear All
						</button>
						<button
							class="frosted-glass cursor-pointer rounded-full bg-teal-600/40 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-500/40 disabled:cursor-not-allowed disabled:opacity-50"
							onclick={openEmojiPicker}
							disabled={inputIndex >= 16}
						>
							Add Emoji
						</button>
					</div>

					{#if isComplete}
						<div class=" mt-4 rounded-3xl bg-green-900/60 p-3 text-center">
							<span class="text-green-600 dark:text-green-400"
								>✓ Sequence complete! Key generated.</span
							>
						</div>
					{/if}
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
