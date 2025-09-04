<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { expoInOut } from 'svelte/easing';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { arrayBufferToBase64, base64ToArrayBuffer } from '$lib/crypto/utils';
	import { emojiVerificationStore } from '$lib/stores/emojiVerification.svelte';

	let base64: string;

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

	let emojiSequence = $state<string[]>([]);
	let displayEmojis = $state<string[]>([]);

	function getDateSalt(): Uint8Array {
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

		return `${hours.toString().padStart(1, '0')} hours and ${minutes.toString().padStart(2, '0')} minutes`;
	}

	async function base64ToEmojiSequence(base64: string): Promise<void> {
		if (!base64) {
			throw new Error('base64 not found.');
		}

		const bytes = new Uint8Array(base64ToArrayBuffer(base64));

		if (bytes.length !== 16) {
			throw new Error('Invalid base64 length. Must be exactly 16 bytes.');
		}

		const dateSalt = getDateSalt();
		const saltArray = new Uint8Array(dateSalt);

		// Derive a 16-byte mask from dateSalt (SHA-256 then slice to 16 bytes)
		const saltHashBuffer = await crypto.subtle.digest('SHA-256', saltArray);
		const saltHash = new Uint8Array(saltHashBuffer).slice(0, 16);
		console.log('Date salt:', arrayBufferToBase64(saltArray.buffer));

		// XOR seed with saltHash to create temporary bytes
		const tempBytes = new Uint8Array(16);
		for (let i = 0; i < 16; i++) {
			tempBytes[i] = bytes[i] ^ saltHash[i];
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

		displayEmojis = emojis;
	}

	export async function emojiSequenceToBase64(emojis: string[]): Promise<string> {
		if (emojis.length !== 16) {
			throw new Error('Invalid emoji sequence length.');
		}

		const indices = emojis.map((emoji) => EMOJI_SET.indexOf(emoji));

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

		const base64 = arrayBufferToBase64(seedBytes.buffer);
		return base64;
	}

	// // Generate key from completed emoji sequence
	// async function generateKeyFromSequence() {
	// 	try {
	// 		const base64 = await emojiSequenceToBase64(emojiSequence);
	// 		emojiVerificationStore.onMatch?.(base64);
	// 	} catch (error) {
	// 		modalStore.alert('Error', 'Failed to generate key from emoji sequence: ' + error);
	// 		console.error('Failed to generate key from emoji sequence:', error);
	// 	}
	// }

	// onMount(() => {
	// 	emojiVerificationStore.clearInput = clearSequence;
	// });

	$effect(() => {
		if (emojiVerificationStore.isOpen) {
			if (emojiVerificationStore.base64) {
				base64 = emojiVerificationStore.base64;
				base64ToEmojiSequence(base64);
			}
		}
	});
</script>

{#if emojiVerificationStore.isOpen}
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
				onclick={() => emojiVerificationStore.close()}
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
			<h3 class="mt-2 mb-5 max-w-[80%] text-lg font-semibold text-white">
				{emojiVerificationStore.title}
			</h3>
			<div class="space-y-4">
				<div class="emoji-consistent grid grid-cols-4 justify-items-center gap-3 px-0 select-none">
					{#each displayEmojis as emoji, index}
						<div
							class="flex size-18 items-center justify-center rounded-lg border-2 border-gray-600 text-4xl transition-colors"
						>
							{emoji}
						</div>
					{/each}
				</div>
			</div>

			<div class="mt-5 p-5">
				<button
					onclick={() => emojiVerificationStore.onMatch?.()}
					class="frosted-glass mb-5 w-full cursor-pointer rounded-full bg-teal-600/40 py-3 text-white transition-colors hover:bg-teal-500/40 focus:ring-blue-500"
					>They match</button
				>
				<button
					onclick={() => emojiVerificationStore.onFail?.()}
					class="frosted-glass w-full cursor-pointer rounded-full bg-red-600/40 py-3 text-white transition-colors hover:bg-red-500/40 focus:ring-blue-500"
					>They don't match</button
				>
			</div>

			<p class=" text-center text-sm text-gray-400">
				This sequence will expire in {getSaltTimeRemaining()}
			</p>
		</div>
	</div>
{/if}
