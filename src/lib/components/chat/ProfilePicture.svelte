<script lang="ts">
	import type { SafeUser } from '$lib/types';

	let {
		user,
		class: className = '',
		background = null,
		style,
		size = '3rem'
	}: {
		user: SafeUser | null;
		class?: string;
		background?: string | null;
		style?: string;
		size?: string;
	} = $props();

	const getFontSize = (containerSize: string) => {
		// Extract numeric value and unit
		const match = containerSize.match(/^(\d+(?:\.\d+)?)(.*)$/);
		if (!match) return '1rem';

		const [, value, unit] = match;
		const numericValue = parseFloat(value);

		const fontSize = numericValue * 0.5;
		return `${fontSize}${unit}`;
	};
</script>

<div
	class="{className} flex flex-shrink-0 items-center justify-center rounded-full {background !==
	null
		? background
		: 'bg-gray-500'}  text-white select-none"
	style="{style} width: {size}; height: {size}; font-size: {getFontSize(size)}"
>
	<p>{user?.displayName.charAt(0).toUpperCase()}</p>
</div>
