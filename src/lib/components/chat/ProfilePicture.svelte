<script lang="ts">
	import type { SafeUser } from '$lib/types';

	let {
		user,
		customUrl,
		class: className = '',
		background = null,
		style,
		size = '3rem',
		imageSize
	}: {
		user: SafeUser | null;
		customUrl?: string | null;
		class?: string;
		background?: string | null;
		style?: string;
		size?: string;
		imageSize?: string;
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

{#if customUrl}
	<div
		class="{className} flex flex-shrink-0 items-center justify-center rounded-full select-none"
		style="{style} width: {size}; height: {size};"
	>
		<img
			class="h-full w-full rounded-full object-cover"
			src={customUrl}
			alt="Profile"
			draggable="false"
		/>
	</div>
{:else if user?.profilePic}
	<div
		class="{className} flex flex-shrink-0 items-center justify-center rounded-full select-none"
		style="{style} width: {size}; height: {size};"
	>
		<img
			class="h-full w-full rounded-full object-cover"
			src={`/api/profile-picture?filePath=${encodeURIComponent(user.profilePic)}${imageSize ? `&size=${imageSize}` : ''}`}
			alt="Profile"
			draggable="false"
		/>
	</div>
{:else}
	<div
		class="{className} flex flex-shrink-0 items-center justify-center rounded-full {background !==
		null
			? background
			: 'bg-gray-500'}  text-white select-none"
		style="{style} width: {size}; height: {size}; font-size: {getFontSize(size)}"
	>
		<p>{user?.displayName.charAt(0).toUpperCase()}</p>
	</div>
{/if}
