<script lang="ts">
	let {
		initialColor = '#3b82f6',
		onColorChange = (color: string) => {}
	}: {
		initialColor?: string;
		onColorChange?: (color: string) => void;
	} = $props();

	let color = $state(initialColor);
	let isOpen = $state(false);

	const presetColors = [
		'#f54a00', // Orange
		'#e17100', // Amber
		'#d08700', // Yellow
		'#5ea500', // Lime
		'#00a63e', // Green
		'#009689', // Teal
		'#0084d1', // Sky
		'#155dfc', // Blue
		'#4f39f6', // Indigo
		'#7f22fe', // Violet
		'#9810fa', // Purple
		'#c800de', // Fuchsia
		'#e60076' // Pink
	];

	let colorInput: HTMLInputElement | null = $state(null);

	function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result
			? {
					r: parseInt(result[1], 16),
					g: parseInt(result[2], 16),
					b: parseInt(result[3], 16)
				}
			: null;
	}

	function isLightColor(hex: string): boolean {
		const rgb = hexToRgb(hex);
		if (!rgb) return true;
		const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
		return brightness > 155;
	}

	function selectColor(newColor: string) {
		color = newColor;
	}

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const value = target.value;
		if (/^#[0-9A-F]{6}$/i.test(value)) {
			selectColor(value);
		}
	}

	const textColor = $derived(isLightColor(color) ? 'text-gray-900' : 'text-white');
</script>

<div class="relative inline-block">
	<button
		onclick={() => (isOpen = !isOpen)}
		class="flex items-center gap-3 rounded-full border-2 bg-gray-800/60 p-6 px-4 py-2 pl-2 shadow-sm frosted-glass transition-colors hover:border-gray-400"
	>
		<div
			class="h-8 w-8 rounded-full border-2 border-gray-700 shadow-inner"
			style="background-color: {color}"
		></div>
		<span class="font-medium text-white">{color}</span>
		<svg
			class="h-4 w-4 text-gray-500 transition-transform {isOpen ? 'rotate-180' : ''}"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	{#if isOpen}
		<div
			class="absolute z-50 mt-2 min-w-[280px] rounded-4xl border bg-gray-800/60 p-4 frosted-glass-shadow"
		>
			<div class="mb-4">
				<button
					onclick={() => colorInput?.click()}
					class="flex h-20 w-full cursor-pointer items-center justify-center rounded-3xl border-2 border-gray-700 shadow-inner {textColor} text-lg font-semibold"
					style="background-color: {color}"
				>
					{color}
				</button>
			</div>

			<input
				bind:this={colorInput}
				type="color"
				value={color}
				oninput={handleInput}
				class="hidden"
			/>

			<div class="mb-4">
				<p class="mb-2 block text-sm font-medium text-white">Hex Code</p>
				<input
					type="text"
					value={color}
					oninput={handleInput}
					class="w-full rounded-full border border-gray-700 bg-gray-700/20 px-3 py-2 text-sm text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
					placeholder="#000000"
				/>
			</div>

			<div>
				<p class="mb-2 block text-sm font-medium text-white">Preset Colors</p>
				<div class="grid grid-cols-5 gap-2">
					{#each presetColors as presetColor}
						<button
							onclick={() => selectColor(presetColor)}
							class="h-10 w-10 rounded-full border-2 transition-transform hover:scale-110 {color ===
							presetColor
								? 'border-blue-500 ring-2 ring-blue-300'
								: 'border-gray-700'}"
							style="background-color: {presetColor}"
							title={presetColor}
							aria-label={presetColor}
						></button>
					{/each}
				</div>
			</div>

			<button
				onclick={() => {
					isOpen = false;
					onColorChange(color);
				}}
				class="mt-4 w-full cursor-pointer rounded-full bg-accent-600/40 px-4 py-2 font-medium text-white frosted-glass transition-colors hover:bg-accent-500/40"
			>
				Done
			</button>
		</div>
	{/if}
</div>

<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="fixed inset-0 z-40" onclick={() => (isOpen = false)}></div>
{/if}
