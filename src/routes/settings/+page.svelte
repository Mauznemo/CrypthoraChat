<script lang="ts">
	import { goto } from '$app/navigation';
	import { getContext } from 'svelte';
	import type { PageProps } from './$types';
	import Icon from '@iconify/svelte';

	let { data }: PageProps = $props();

	const settingsTitle = getContext<any>('settingsTitle');
	settingsTitle.set('Settings');

	let categories = [
		{
			label: 'Appearance',
			path: '/settings/appearance',
			icon: 'mdi:color'
		},
		{
			label: 'Sessions',
			path: '/settings/sessions',
			icon: 'mdi:important-devices'
		},
		{
			label: 'Storage',
			path: '/settings/storage',
			icon: 'mdi:storage'
		},
		{
			label: 'Advanced',
			path: '/settings/advanced',
			icon: 'mdi:gear'
		}
	];
</script>

{#each categories as category}
	<button
		class="flex w-full cursor-pointer items-center gap-5 rounded-full p-3 py-2 text-2xl text-gray-300 transition-colors hover:bg-gray-300/30 hover:text-gray-200"
		onclick={() => {
			settingsTitle.set(category.label);
			goto(category.path);
		}}><Icon icon={category.icon} class="size-8" /> {category.label}</button
	>
{/each}
