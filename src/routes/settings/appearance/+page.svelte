<script lang="ts">
	import ColorPicker from '$lib/components/ColorPicker.svelte';
	import { getThemeAccentColor, setThemeAccentColor } from '$lib/theming';
	import { formatHex } from 'culori';
	import { onMount } from 'svelte';

	let currentColor: string | null = $state(null);

	let selectedColor = $state('#3b82f6');

	function handleColorChange(color: string) {
		selectedColor = color;
		setThemeAccentColor(color);
	}

	onMount(() => {
		currentColor = getThemeAccentColor();
	});
</script>

<p class="mt-4 mb-1 text-xl font-bold">Accent Color</p>
{#if currentColor}
	<ColorPicker initialColor={formatHex(currentColor)} onColorChange={handleColorChange} />
{/if}

<p class="mt-4 mb-1 text-xl font-bold">Preview</p>
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
