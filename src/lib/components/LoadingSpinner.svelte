<script lang="ts">
	const {
		size = '48px',
		strokeWidth = 4
	}: {
		size?: string;
		strokeWidth?: number;
	} = $props();
</script>

<div class="flex h-full items-center justify-center">
	<svg class="animate-spin" viewBox="0 0 50 50" style="width: {size}; height: {size};">
		<circle
			class="text-gray-300/20"
			cx="25"
			cy="25"
			r="20"
			fill="none"
			stroke="currentColor"
			stroke-width={strokeWidth}
		/>
		<circle
			class="animate-stroke text-white"
			cx="25"
			cy="25"
			r="20"
			fill="none"
			stroke="currentColor"
			stroke-width={strokeWidth}
			stroke-linecap="round"
			stroke-dasharray="0 125.6"
		/>
	</svg>
</div>

<!--
	Do not wrap these rules in `@layer`. Svelte extracts component styles into their own
	stylesheet, which can be linked before the Tailwind one — declaring a layer here would
	register it first and push Tailwind's `utilities` below `base`, breaking the whole app.
	Scoped selectors already outrank Tailwind's own `.animate-spin` without a layer.
-->
<style>
	@keyframes spin-animation {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	@keyframes stroke-animation {
		50% {
			stroke-dasharray: 80 125.6;
		}
		100% {
			stroke-dasharray: 0 125.6;
		}
		50% {
			stroke-dasharray: 80 125.6;
		}
	}

	.animate-spin {
		animation: spin-animation 1s cubic-bezier(0.25, 0.68, 0.82, 0.44) infinite;
		transform-origin: center;
	}

	.animate-stroke {
		animation: stroke-animation 1s ease-in-out infinite;
		transform-origin: center;
	}
</style>
