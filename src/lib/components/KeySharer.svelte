<script lang="ts">
	import { onMount, tick, untrack, type Snippet } from 'svelte';
	import { emojiPickerStore } from '$lib/stores/emojiPicker.svelte';
	import { keySharerStore } from '$lib/stores/keySharer.svelte';
	import { fade, scale } from 'svelte/transition';
	import { expoInOut } from 'svelte/easing';
	import { modalStore } from '$lib/stores/modal.svelte';
	import {
		arrayBufferToBase64,
		base64ToArrayBuffer,
		base64ToKey,
		decryptKeyFromStorage,
		decryptStringWithKey,
		encryptStringWithKey
	} from '$lib/crypto/utils';
	import Icon from '@iconify/svelte';
	import emojiData from 'unicode-emoji-json/data-by-emoji.json';
	import { t } from 'svelte-i18n';
	import QRCode from 'qrcode';
	import { Html5Qrcode } from 'html5-qrcode';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { onboardingStore } from '$lib/stores/onboarding.svelte';
	import { getMasterSeedForSharing } from '$lib/crypto/master';
	import { getEncryptedKey, removeEncryptedKey, saveEncryptedKey } from './keySharer.remote';

	type EmojiDataType = typeof emojiData;

	let isOpen = $state(false);
	let shareType: 'emojiSequence' | 'showQrCode' | 'scanQrCode' = $state('emojiSequence');
	let mode: 'export' | 'import' = $state('import');
	let base64Seed: string;

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
	let inputIndex = $state(0);

	let qrCodeDataUrl = $state('');
	let qrScanner: Html5Qrcode;

	function getDateSalt(): Uint8Array {
		if (!keySharerStore.useDateSalt) return new Uint8Array(0);

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

	function getSaltTimeRemaining() {
		const now = new Date();

		const nextMidnight = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
		);

		const diffMs = nextMidnight.getTime() - now.getTime();

		// Convert to hours and minutes
		const diffMinutes = Math.floor(diffMs / (1000 * 60));
		const hours = Math.floor(diffMinutes / 60);
		const minutes = diffMinutes % 60;

		return {
			hours: hours.toString().padStart(1, '0'),
			minutes: minutes.toString().padStart(2, '0')
		};
	}

	export async function seedToBase64WithDateSalt(seed: string): Promise<string> {
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

		return arrayBufferToBase64(tempBytes.buffer);
	}

	export async function base64WithDateSaltToSeed(base64: string): Promise<string> {
		if (!base64) {
			throw new Error('base64 not found.');
		}

		const tempBytes = new Uint8Array(base64ToArrayBuffer(base64));

		if (tempBytes.length !== 16) {
			throw new Error('Invalid base64 length. Must be exactly 16 bytes.');
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

		return arrayBufferToBase64(seedBytes.buffer);
	}

	// #region Emoji Utils
	export async function seedToEmojiSequence(base64Seed: string): Promise<string[]> {
		const base64 = await seedToBase64WithDateSalt(base64Seed);
		const seedBytes = new Uint8Array(base64ToArrayBuffer(base64));

		const emojis: string[] = [];
		for (let i = 0; i < 16; i++) {
			emojis.push(EMOJI_SET[seedBytes[i]]);
		}

		return emojis;
	}

	export async function emojiSequenceToSeed(emojis: string[]): Promise<string> {
		if (emojis.length !== 16) {
			throw new Error('Invalid emoji sequence length.');
		}

		const indices = emojis.map((emoji) => EMOJI_SET.indexOf(emoji));

		const tempBytes = new Uint8Array(16);
		for (let i = 0; i < 16; i++) {
			tempBytes[i] = indices[i];
		}

		const base64Seed = await base64WithDateSaltToSeed(arrayBufferToBase64(tempBytes.buffer));
		return base64Seed;
	}

	function handleEmojiSelect(emoji: string) {
		if (mode === 'import' && inputIndex < 16) {
			emojiSequence[inputIndex] = emoji;
			inputIndex++;

			if (inputIndex === 16) {
				generateKeyFromSequence();
			}
		}
	}

	async function generateKeyFromSequence() {
		try {
			const seed = await emojiSequenceToSeed(emojiSequence);
			toastStore.success($t('utils.key-sharer.key-imported-successfully'));
			keySharerStore.onDone?.(seed);
			close();
		} catch (error) {
			modalStore.error(error, $t('utils.key-sharer.failed-to-generate-key'));
			console.error('Failed to generate key from emoji sequence:', error);
		}
	}

	function clearSequence() {
		emojiSequence = [];
		inputIndex = 0;
	}

	function removeLastEmoji() {
		if (inputIndex > 0) {
			inputIndex--;
			emojiSequence[inputIndex] = '';
		}
	}

	function openEmojiPicker(event: MouseEvent) {
		if (mode === 'import') {
			emojiPickerStore.open(event.target as HTMLElement, handleEmojiSelect, [...EMOJI_SET].sort());
		}
	}

	// #endregion

	// Export: Show seed as emojis
	async function initExportShowEmojis(seed: string) {
		displayEmojis = await seedToEmojiSequence(seed);
	}

	// Export: Show seed as QR code
	async function initExportShowQrCode(seed: string) {
		const seedWithSalt = await seedToBase64WithDateSalt(seed);
		qrCodeDataUrl = await QRCode.toDataURL(seedWithSalt);
	}

	// Export: Scan key => save encrypted master seed in db
	async function initExportScanQrCode() {
		await tick();
		const id = 'qr-reader';
		qrScanner = new Html5Qrcode(id);
		qrScanner.start(
			{ facingMode: 'environment' },
			{
				fps: 10,
				qrbox: 250
			},
			async (decodedText) => {
				try {
					let key = await base64ToKey(decodedText);
					const seedBase64 = await getMasterSeedForSharing();
					const encryptedSeed = await encryptStringWithKey(seedBase64, key);
					saveEncryptedKey(encryptedSeed);
				} catch (error) {
					qrScanner.pause(false);
					modalStore.open({
						title: $t('utils.key-sharer.invalid'),
						content: $t('utils.key-sharer.invalid-qr-code'),
						buttons: [
							{
								text: $t('common.close'),
								variant: 'secondary',
								onClick: () => {
									qrScanner.stop();
									close();
								}
							},
							{
								text: $t('common.retry'),
								variant: 'primary',
								onClick: () => {
									qrScanner.resume();
								}
							}
						]
					});

					return;
				}
				toastStore.success($t('utils.key-sharer.key-exported-successfully'));
				close();
				qrScanner.stop();
			},
			(error) => {}
		);
	}

	// Import: Show key as emojis
	function initImportEmojis() {
		shareType = 'emojiSequence';
		emojiSequence = [];
		inputIndex = 0;
	}

	// Import: Generate key => show as qr => wait for enc seed in db
	async function initImportShowQrCode() {
		const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
			'encrypt',
			'decrypt'
		]);

		const exported = await crypto.subtle.exportKey('raw', key);
		const keyBase64 = arrayBufferToBase64(exported);

		qrCodeDataUrl = await QRCode.toDataURL(keyBase64);
		const interval = setInterval(async () => {
			const encryptedSeed = await getEncryptedKey();
			if (encryptedSeed) {
				await removeEncryptedKey();
				clearInterval(interval);
				const seedBase64 = await decryptStringWithKey(encryptedSeed, key);
				toastStore.success($t('utils.key-sharer.key-imported-successfully'));
				keySharerStore.onDone?.(seedBase64);
				close();
			}
		}, 5000);
	}

	// Import: Scan seed as qr code
	async function initImportScanQrCode() {
		await tick();
		const id = 'qr-reader';
		qrScanner = new Html5Qrcode(id);
		qrScanner.start(
			{ facingMode: 'environment' },
			{
				fps: 10,
				qrbox: 250
			},
			async (decodedText) => {
				let seed: string;
				try {
					seed = await base64WithDateSaltToSeed(decodedText);
				} catch (error) {
					qrScanner.pause(false);
					modalStore.open({
						title: $t('utils.key-sharer.invalid'),
						content: $t('utils.key-sharer.invalid-qr-code'),
						buttons: [
							{
								text: $t('common.close'),
								variant: 'secondary',
								onClick: () => {
									qrScanner.stop();
									close();
								}
							},
							{
								text: $t('common.retry'),
								variant: 'primary',
								onClick: () => {
									qrScanner.resume();
								}
							}
						]
					});

					return;
				}
				toastStore.success($t('utils.key-sharer.key-imported-successfully'));
				keySharerStore.onDone?.(seed);
				close();
				qrScanner.stop();
			},
			(error) => {}
		);
	}

	function initEmoji() {
		shareType = 'emojiSequence';

		if (mode === 'export') {
			if (onboardingStore.showBackupMasterKeyNotice) {
				onboardingStore.disableBackupMasterKeyNotice();

				modalStore.alert(
					$t('utils.key-sharer.backup-master-key-notice-title'),
					$t('utils.key-sharer.backup-master-key-notice-content'),
					{ dismissible: false }
				);
			}

			if (keySharerStore.base64Seed) base64Seed = keySharerStore.base64Seed;
			initExportShowEmojis(base64Seed);
			initExportShowEmojis(base64Seed);
		} else if (mode === 'import') {
			initImportEmojis();
		}
		isOpen = true;
		console.log('initEmoji');
	}

	function initQrCode(show: boolean) {
		shareType = show ? 'showQrCode' : 'scanQrCode';

		if (mode === 'export') {
			if (shareType === 'showQrCode') {
				keySharerStore.useDateSalt = true;
				if (keySharerStore.base64Seed) base64Seed = keySharerStore.base64Seed;
				initExportShowQrCode(base64Seed);
			} else if (shareType === 'scanQrCode') {
				initExportScanQrCode();
			}
		}
		isOpen = true;
		if (mode === 'import') {
			if (shareType === 'showQrCode') {
				initImportShowQrCode();
			} else if (shareType === 'scanQrCode') {
				keySharerStore.useDateSalt = true;
				initImportScanQrCode();
			} else if (shareType === 'emojiSequence') {
				initImportEmojis();
			}
		}
		console.log('initQrCode');
	}

	onMount(() => {
		keySharerStore.clearInput = clearSequence;
	});

	function openExport() {
		mode = 'export';
		modalStore.open({
			title: $t('utils.key-sharer.select-mode'),
			content: $t('utils.key-sharer.select-mode-export-content'),
			buttonAlignment: 'vertical',
			buttons: [
				{
					text: $t('utils.key-sharer.show-qr-code'),
					variant: 'primary',
					disabled: onboardingStore.showBackupMasterKeyNotice,
					onClick: () => {
						initQrCode(true);
					}
				},
				{
					text: $t('utils.key-sharer.scan-qr-code'),
					variant: 'primary',
					disabled: onboardingStore.showBackupMasterKeyNotice,
					onClick: () => {
						initQrCode(false);
					}
				},
				{
					text: $t('utils.key-sharer.emoji-sequence'),
					variant: 'primary',
					outlined: onboardingStore.showBackupMasterKeyNotice,
					onClick: () => {
						initEmoji();
					}
				}
			],
			onClose: () => {
				if (!isOpen) keySharerStore.close();
			}
		});
	}

	function openImport() {
		mode = 'import';
		modalStore.open({
			title: $t('utils.key-sharer.select-mode'),
			content: $t('utils.key-sharer.select-mode-import-content'),
			buttonAlignment: 'vertical',
			buttons: [
				{
					text: $t('utils.key-sharer.show-qr-code'),
					variant: 'primary',
					onClick: () => {
						initQrCode(true);
					}
				},
				{
					text: $t('utils.key-sharer.scan-qr-code'),
					variant: 'primary',
					onClick: () => {
						initQrCode(false);
					}
				},
				{
					text: $t('utils.key-sharer.emoji-sequence'),
					variant: 'primary',
					onClick: () => {
						initEmoji();
					}
				}
			],
			onClose: () => {
				if (!isOpen) keySharerStore.close();
			}
		});
	}

	function open() {
		mode = keySharerStore.base64Seed ? 'export' : 'import';

		if (mode === 'export') openExport();
		else if (mode === 'import') openImport();
	}

	function close() {
		isOpen = false;
		keySharerStore.close();
		if (qrScanner) qrScanner.stop();
	}

	$effect(() => {
		const currentIsOpen = keySharerStore.isOpen;

		untrack(() => {
			if (currentIsOpen) {
				open();
			}
		});
	});

	const progress = $derived(mode === 'import' ? (inputIndex / 16) * 100 : 100);
</script>

{#if isOpen}
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
				onclick={close}
				class="absolute right-5 cursor-pointer p-1 text-gray-400 transition-colors hover:text-gray-200"
				aria-label="Close modal"
			>
				<Icon icon="mdi:close" class="size-6" />
			</button>
			{#if shareType === 'emojiSequence'}
				{#if mode === 'export'}
					<h3 class="mt-2 mb-5 text-lg font-semibold text-white">
						{keySharerStore.title}
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
				{:else}
					<div>
						<div class="mb-6">
							<h3 class="mt-2 mb-5 text-lg font-semibold text-white">
								{keySharerStore.title}
							</h3>
							<div class="h-2 w-full overflow-hidden rounded-full bg-gray-700">
								<div
									class="h-full bg-accent-500 transition-all duration-300 ease-out"
									style="width: {progress}%"
								></div>
							</div>
							<p class="mt-1 text-sm text-gray-400">
								{$t('utils.key-sharer.input-progress', { values: { index: inputIndex } })}
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
								{$t('utils.key-sharer.remove-last')}
							</button>
							<button
								class="cursor-pointer rounded-full bg-red-800/40 px-4 py-2 text-sm font-medium text-white frosted-glass transition-colors hover:bg-red-600/40 disabled:cursor-not-allowed disabled:opacity-50"
								onclick={clearSequence}
								disabled={inputIndex === 0}
							>
								{$t('utils.key-sharer.clear')}
							</button>
							<button
								class="cursor-pointer rounded-full bg-accent-700/60 px-4 py-2 text-sm font-medium text-white frosted-glass transition-colors hover:bg-accent-600/50 disabled:cursor-not-allowed disabled:opacity-50"
								onclick={openEmojiPicker}
								disabled={inputIndex >= 16}
							>
								{$t('utils.key-sharer.add-emoji')}
							</button>
						</div>
					</div>
				{/if}
			{:else if shareType === 'showQrCode'}
				<h3 class="mt-2 mb-5 text-lg font-semibold text-white">
					{keySharerStore.title}
				</h3>
				{#if mode === 'export' || mode === 'import'}
					<div class="flex justify-center">
						<img src={qrCodeDataUrl} alt="QR Code" class="h-48 w-48 rounded-xl" />
					</div>
				{/if}
			{:else if shareType === 'scanQrCode'}
				<h3 class="mt-2 mb-5 text-lg font-semibold text-white">
					{keySharerStore.title}
				</h3>

				{#if mode === 'import' || mode === 'export'}
					<div class="flex justify-center">
						<div id="qr-reader" class="h-64 w-64 overflow-hidden rounded-2xl"></div>
					</div>
				{/if}
			{/if}
			{#if keySharerStore.useDateSalt}
				{@const timeRemaining = getSaltTimeRemaining()}
				<p class="mt-3 text-center text-sm text-gray-400">
					{$t('utils.key-sharer.time-remaining', {
						values: {
							hours: timeRemaining.hours,
							minutes: timeRemaining.minutes
						}
					})}
				</p>
			{/if}
		</div>
	</div>
{/if}
