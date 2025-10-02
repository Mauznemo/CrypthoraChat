<script lang="ts">
	import ColorPicker from '$lib/components/ColorPicker.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { formatHex } from 'culori';
	import { onMount } from 'svelte';

	let currentAccentColor: string | null = $state(null);
	let currentBackgroundColor1: string | null = $state(null);
	let currentBackgroundColor2: string | null = $state(null);

	let selectedAccentColor = $state('#3b82f6');

	let backgroundTypes = ['circles', 'gradient', 'solid'];
	let selectedBackgroundType = $state('circles');

	function handleAccentColorChange(color: string) {
		selectedAccentColor = color;
		themeStore.setThemeAccentColor(color);
	}

	function handleBackgroundColorChange(color: string, id: '1' | '2') {
		// document.documentElement.style.setProperty('--color-background-' + id, color);
		themeStore.setBackgroundColor(parseInt(id), color);
	}

	function handleBackgroundChange(event: Event) {
		themeStore.setBackgroundType(
			(event.target as HTMLSelectElement).value as 'circles' | 'gradient' | 'solid'
		);

		selectedBackgroundType = themeStore.backgroundType;
	}

	onMount(() => {
		currentAccentColor = themeStore.getThemeAccentColor();
		currentBackgroundColor1 = themeStore.getBackgroundColor(1);
		currentBackgroundColor2 = themeStore.getBackgroundColor(2);

		selectedBackgroundType = themeStore.getBackgroundType();
	});
</script>

<p class="mt-4 mb-1 text-xl font-bold">Accent Color</p>
{#if currentAccentColor}
	<ColorPicker
		initialColor={formatHex(currentAccentColor)}
		onColorChange={handleAccentColorChange}
	/>
{/if}

<p class="mt-4 mb-1 text-lg font-bold">Preview</p>
<div class="flex w-fit flex-col items-end gap-2 rounded-xl border border-gray-400 p-4">
	<div class="relative w-fit rounded-2xl bg-accent-700/60 p-3 frosted-glass-shadow">
		<p class="pr-8">Hello</p>
		<div class="absolute right-2 bottom-1 text-xs text-gray-300 opacity-70">
			{new Date().toLocaleTimeString([], {
				hour: '2-digit',
				minute: '2-digit'
			})}
		</div>
	</div>
	<div class="relative w-fit rounded-2xl bg-accent-700/60 p-3 frosted-glass-shadow">
		<p class="pr-8">This is what a message looks like!</p>
		<div class="absolute right-2 bottom-1 text-xs text-gray-300 opacity-70">
			{new Date().toLocaleTimeString([], {
				hour: '2-digit',
				minute: '2-digit'
			})}
		</div>
	</div>

	<div class="flex items-center gap-2 rounded-xl bg-gray-800/60 p-3 frosted-glass">
		<div class="h-6 w-5 rounded-full bg-accent-100"></div>
		<div class="h-6 w-5 rounded-full bg-accent-50"></div>
		<div class="h-6 w-5 rounded-full bg-accent-200"></div>
		<div class="h-6 w-5 rounded-full bg-accent-300"></div>
		<div class="h-6 w-5 rounded-full bg-accent-400"></div>
		<div class="h-6 w-5 rounded-full bg-accent-500"></div>
		<div class="h-6 w-5 rounded-full bg-accent-600"></div>
		<div class="h-6 w-5 rounded-full bg-accent-700"></div>
		<div class="h-6 w-5 rounded-full bg-accent-800"></div>
		<div class="h-6 w-5 rounded-full bg-accent-900"></div>
		<div class="h-6 w-5 rounded-full bg-accent-950"></div>
	</div>
</div>

<p class="mt-4 mb-1 text-xl font-bold">Background</p>

<select
	onchange={handleBackgroundChange}
	class="w-32 rounded-full border-2 border-gray-600 bg-gray-800/60 p-2.5 px-4 font-medium text-white placeholder-gray-400 frosted-glass focus:border-blue-500 focus:ring-blue-500"
>
	{#each backgroundTypes as type, index}
		<option selected={type === selectedBackgroundType} value={type}
			>{type.charAt(0).toUpperCase() + type.slice(1)}</option
		>
	{/each}
</select>

{#if themeStore.backgroundType === 'gradient' && currentBackgroundColor1 && currentBackgroundColor2}
	<p class="mt-4 mb-1 text-lg font-bold">Top Left</p>
	<ColorPicker
		initialColor={formatHex(currentBackgroundColor1)}
		onColorChange={(c) => handleBackgroundColorChange(c, '1')}
	/>
	<p class="mt-4 mb-1 text-lg font-bold">Bottom Right</p>
	<ColorPicker
		initialColor={formatHex(currentBackgroundColor2)}
		onColorChange={(c) => handleBackgroundColorChange(c, '2')}
	/>
{:else if themeStore.backgroundType === 'solid' && currentBackgroundColor1}
	<p class="mt-4 mb-1 text-lg font-bold">Tint Color</p>
	<ColorPicker
		initialColor={formatHex(currentBackgroundColor1)}
		onColorChange={(c) => handleBackgroundColorChange(c, '1')}
	/>
{/if}
