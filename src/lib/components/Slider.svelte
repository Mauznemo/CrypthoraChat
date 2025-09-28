<script lang="ts">
	import { onMount } from 'svelte';

	let {
		class: className = '',
		onInput,
		min = 0,
		max = 100,
		value = $bindable(0),
		step = 1,
		disabled = false,
		ariaLabel = ''
	}: {
		class?: string;
		onInput?: (value: number) => void;
		min?: number;
		max?: number;
		value?: number;
		step?: number;
		disabled?: boolean;
		ariaLabel?: string;
	} = $props();

	let sliderElement: HTMLDivElement;
	let isDragging = $state(false);

	let displayWidth = $state(50);

	$effect(() => {
		if (!sliderElement) {
			displayWidth = 50;
			return;
		}

		displayWidth = calculateValue(value);
	});

	onMount(() => {
		setTimeout(() => {
			displayWidth = calculateValue(value);
		}, 100);
	});

	function calculateValue(value: number): number {
		const percentage = max > min ? ((value - min) / (max - min)) * 100 : 0;
		const sliderWidth = sliderElement.offsetWidth;
		const minWidthPercentage = (20 / sliderWidth) * 100;

		console.log('minWidthPercentage', minWidthPercentage);

		return Math.max(minWidthPercentage, percentage);
	}

	function handlePointerDown(event: PointerEvent): void {
		if (disabled) return;

		isDragging = true;
		(event.target as Element)?.setPointerCapture(event.pointerId);
		updateValue(event);

		const handlePointerMove = (e: PointerEvent) => {
			if (!isDragging) return;
			e.preventDefault();
			updateValue(e);
		};

		const handlePointerUp = (e: PointerEvent) => {
			isDragging = false;
			(e.target as Element)?.releasePointerCapture(e.pointerId);
			document.removeEventListener('pointermove', handlePointerMove);
			document.removeEventListener('pointerup', handlePointerUp);
			document.removeEventListener('pointercancel', handlePointerUp);
		};

		document.addEventListener('pointermove', handlePointerMove);
		document.addEventListener('pointerup', handlePointerUp);
		document.addEventListener('pointercancel', handlePointerUp);
	}

	function updateValue(event: PointerEvent): void {
		const rect = sliderElement.getBoundingClientRect();
		const clientX = event.clientX;
		const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

		const range = max - min;
		let newValue = min + percentage * range;

		if (step > 0) {
			newValue = Math.round(newValue / step) * step;
		}

		newValue = Math.max(min, Math.min(max, newValue));

		value = newValue;

		onInput?.(value);
	}

	function handleKeyDown(event: KeyboardEvent): void {
		if (disabled) return;

		const range = max - min;
		const stepSize = step > 0 ? step : range / 100;

		switch (event.key) {
			case 'ArrowLeft':
			case 'ArrowDown':
				event.preventDefault();
				value = Math.max(min, value - stepSize);
				break;
			case 'ArrowRight':
			case 'ArrowUp':
				event.preventDefault();
				value = Math.min(max, value + stepSize);
				break;
			case 'Home':
				event.preventDefault();
				value = min;
				break;
			case 'End':
				event.preventDefault();
				value = max;
				break;
		}
	}
</script>

<div
	bind:this={sliderElement}
	class="{className} relative h-5 cursor-pointer rounded-full bg-white/30 focus:outline-none {disabled
		? 'cursor-not-allowed opacity-50'
		: ''}"
	tabindex={disabled ? -1 : 0}
	role="slider"
	aria-label={ariaLabel}
	aria-valuemin={min}
	aria-valuemax={max}
	aria-valuenow={value}
	aria-disabled={disabled}
	onpointerdown={handlePointerDown}
	onkeydown={handleKeyDown}
>
	{#if displayWidth > 0}
		<div
			class="absolute inset-0 rounded-full bg-gray-300 transition-all duration-75 ease-out"
			style="width: {displayWidth}%"
		></div>
	{/if}

	<!-- Invisible thumb for better click target -->
	<div
		class="absolute top-0 -ml-2.5 h-5 w-5 rounded-full opacity-0"
		style="left: {displayWidth}%"
	></div>
</div>
