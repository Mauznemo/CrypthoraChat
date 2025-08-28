<script lang="ts">
	import type { Snippet } from 'svelte';
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

	let mode: 'display' | 'input' = 'input';
	let chatKey: CryptoKey | string;
	let isOpen = $state(false);

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

	// Convert key to emoji sequence
	async function keyToEmojiSequence(key: CryptoKey | string): Promise<string[]> {
		const exported =
			key instanceof CryptoKey
				? await crypto.subtle.exportKey('raw', key)
				: base64ToArrayBuffer(key);
		const keyBytes = new Uint8Array(exported);
		const dateSalt = getDateSalt();

		// Combine key bytes with optional date salt
		const combined = new Uint8Array(keyBytes.length + dateSalt.length);
		combined.set(keyBytes);
		combined.set(dateSalt, keyBytes.length);

		// Hash the combined data to ensure consistent mapping
		const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
		const hashArray = new Uint8Array(hashBuffer);

		// Use first 16 bytes of hash to create emoji sequence
		const emojis: string[] = [];
		for (let i = 0; i < 16; i++) {
			emojis.push(EMOJI_SET[hashArray[i]]);
		}

		return emojis;
	}

	// Convert emoji sequence back to key
	async function emojiSequenceToKey(emojis: string[]): Promise<CryptoKey> {
		// Create a deterministic seed from the emoji sequence
		const emojiIndices = emojis.map((emoji) => EMOJI_SET.indexOf(emoji));
		const seedArray = new Uint8Array(emojiIndices);

		// Add date salt if enabled
		const dateSalt = getDateSalt();
		const combined = new Uint8Array(seedArray.length + dateSalt.length);
		combined.set(seedArray);
		combined.set(dateSalt, seedArray.length);

		// Generate key material from the seed
		const keyMaterial = await crypto.subtle.digest('SHA-256', combined);

		// Import as AES-GCM key
		return crypto.subtle.importKey(
			'raw',
			keyMaterial.slice(0, 32), // Use first 32 bytes for AES-256
			'AES-GCM',
			true,
			['encrypt', 'decrypt']
		);
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
			const key = await emojiSequenceToKey(emojiSequence);
			emojiKeyConverterStore.onDone?.(key);
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

	async function updateDisplay(key: CryptoKey | string) {
		displayEmojis = await keyToEmojiSequence(key);
	}

	// Update display when key changes
	$effect(() => {
		if (emojiKeyConverterStore.isOpen) {
			console.log('Opened emoji key converter');
			mode = emojiKeyConverterStore.key ? 'display' : 'input';
			if (emojiKeyConverterStore.key) chatKey = emojiKeyConverterStore.key;
			if (mode === 'display' && chatKey) {
				updateDisplay(chatKey);
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
			{#if mode === 'display'}
				<div class="space-y-4">
					<div class="emoji-consistent grid grid-cols-4 justify-items-center gap-3 px-0">
						{#each displayEmojis as emoji, index}
							<div
								class="flex size-18 items-center justify-center rounded-lg border-2 border-gray-600 text-2xl transition-colors"
							>
								{emoji}
							</div>
						{/each}
					</div>
				</div>
			{:else}
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
