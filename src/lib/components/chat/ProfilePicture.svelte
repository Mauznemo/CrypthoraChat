<script lang="ts">
	import type { SafeUser } from '$lib/types';
	import { t } from 'svelte-i18n';

	let {
		user,
		customUrl,
		class: className = '',
		background = null,
		style,
		size = '3rem',
		imageSize,
		online = false
	}: {
		user: SafeUser | null;
		customUrl?: string | null;
		class?: string;
		background?: string | null;
		style?: string;
		size?: string;
		imageSize?: string;
		/** Shows a green dot in the bottom-right corner */
		online?: boolean;
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

{#snippet onlineDot()}
	{#if online}
		<!-- Sits on the circle's edge; the ring separates it from a dark avatar behind it. -->
		<span
			aria-label={$t('chat.online')}
			class="absolute right-0 bottom-0 rounded-full bg-green-500 ring-2 ring-gray-800"
			style="width: calc({size} * 0.28); height: calc({size} * 0.28);"
		></span>
	{/if}
{/snippet}

{#if customUrl}
	<div
		class="{className} relative flex flex-shrink-0 items-center justify-center rounded-full bg-gray-500 select-none"
		style="{style} width: {size}; height: {size};"
	>
		<img
			class="h-full w-full rounded-full object-cover"
			src={customUrl}
			alt="Profile"
			draggable="false"
		/>
		{@render onlineDot()}
	</div>
{:else if user?.profilePicPath}
	<div
		class="{className} relative flex flex-shrink-0 items-center justify-center rounded-full bg-gray-500 select-none"
		style="{style} width: {size}; height: {size};"
	>
		<img
			class="h-full w-full rounded-full object-cover"
			src={`/api/profile-picture?filePath=${encodeURIComponent(user.profilePicPath)}${imageSize ? `&size=${imageSize}` : ''}`}
			alt="Profile"
			draggable="false"
		/>
		{@render onlineDot()}
	</div>
{:else}
	<div
		class="{className} relative flex flex-shrink-0 items-center justify-center rounded-full {background !==
		null
			? background
			: 'bg-gray-500'}  text-white select-none"
		style="{style} width: {size}; height: {size}; font-size: {getFontSize(size)}"
	>
		<p>{user?.displayName.charAt(0).toUpperCase()}</p>
		{@render onlineDot()}
	</div>
{/if}
