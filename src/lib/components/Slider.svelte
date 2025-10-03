<script lang="ts">
	import { lerp } from '$lib/utils/math';
	import { onMount } from 'svelte';

	let {
		class: className = '',
		onInput,
		min = 0,
		max = 100,
		value: remappedValue = $bindable(0),
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

	let rawValue = $state(0);
	let internalRemappedValue = $state(0);
	let displayWidth = $state(50);
	let remapMin = 0;
	let isInternalUpdate = $state(false);

	$effect(() => {
		if (!isInternalUpdate && remappedValue !== internalRemappedValue) {
			internalRemappedValue = remappedValue;
			rawValue = unremapRange(remappedValue, remapMin, min, max);
		}
		isInternalUpdate = false;

		if (sliderElement) {
			displayWidth = calculateValue(rawValue);
		}
	});

	onMount(() => {
		setTimeout(() => {
			displayWidth = calculateValue(rawValue);
		}, 100);
	});

	function setRemappedValue(value: number): void {
		isInternalUpdate = true;
		const clampedValue = Math.max(min, Math.min(max, value));
		internalRemappedValue = clampedValue;
		remappedValue = clampedValue;
		onInput?.(clampedValue);
	}

	function calculateValue(value: number): number {
		if (!sliderElement) return 0;
		const percentage = max > min ? ((value - min) / (max - min)) * 100 : 0;
		const sliderWidth = sliderElement.offsetWidth;
		const minWidthPercentage = (20 / sliderWidth) * 100;

		let remapMinPercentage = 20 / sliderWidth; // 0 - 1
		remapMin = lerp(min, max, remapMinPercentage);

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
		rawValue = min + percentage * range;

		//TODO: add back steps

		const remappedVal = remapRange(rawValue, remapMin, min, max);
		setRemappedValue(remappedVal);
	}

	function remapRange(original: number, remapMin: number, min: number, max: number): number {
		if (original <= remapMin) return min;
		if (original >= max) return max;

		const t = (original - remapMin) / (max - remapMin);
		return lerp(min, max, t);
	}

	function unremapRange(remapped: number, remapMin: number, min: number, max: number): number {
		if (remapped <= min) return remapMin;
		if (remapped >= max) return max;

		return remapMin + ((remapped - min) * (max - remapMin)) / (max - min);
	}

	function handleKeyDown(event: KeyboardEvent): void {
		if (disabled) return;

		const range = max - min;
		const stepSize = step > 0 ? step : range / 100;

		switch (event.key) {
			case 'ArrowLeft':
			case 'ArrowDown':
				event.preventDefault();
				rawValue = Math.max(min, rawValue - stepSize);
				break;
			case 'ArrowRight':
			case 'ArrowUp':
				event.preventDefault();
				rawValue = Math.min(max, rawValue + stepSize);
				break;
			case 'Home':
				event.preventDefault();
				rawValue = min;
				break;
			case 'End':
				event.preventDefault();
				rawValue = max;
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
	aria-valuenow={internalRemappedValue}
	aria-disabled={disabled}
	onpointerdown={handlePointerDown}
	onkeydown={handleKeyDown}
>
	{#if displayWidth > 0}
		<div
			class="absolute inset-0 rounded-full bg-gray-300 {isDragging
				? ''
				: 'transition-all duration-75 ease-out'}"
			style="width: {displayWidth}%"
		></div>
	{/if}

	<!-- Invisible thumb for better click target -->
	<div
		class="absolute top-0 -ml-2.5 h-5 w-5 rounded-full opacity-0"
		style="left: {displayWidth}%"
	></div>
</div>
