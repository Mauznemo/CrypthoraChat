<script lang="ts">
	import { goto } from '$app/navigation';
	import { getContext } from 'svelte';
	import type { PageProps } from './$types';
	import Icon from '@iconify/svelte';
	import { t } from 'svelte-i18n';

	let { data }: PageProps = $props();

	const settingsTitle = getContext<any>('settingsTitle');
	settingsTitle.set($t('settings.settings'));

	let categories = [
		{
			label: 'settings.categories.appearance',
			path: '/settings/appearance',
			icon: 'mdi:color'
		},
		{
			label: 'settings.categories.sessions',
			path: '/settings/sessions',
			icon: 'mdi:important-devices'
		},
		{
			label: 'settings.categories.storage',
			path: '/settings/storage',
			icon: 'mdi:storage'
		},
		{
			label: 'settings.categories.advanced',
			path: '/settings/advanced',
			icon: 'mdi:gear'
		}
	];
</script>

{#each categories as category}
	<button
		class="flex w-full cursor-pointer items-center gap-5 rounded-full p-3 py-2 text-2xl text-gray-300 transition-colors hover:bg-gray-300/30 hover:text-gray-200"
		onclick={() => {
			settingsTitle.set($t(category.label));
			goto(category.path);
		}}><Icon icon={category.icon} class="size-8" /> {$t(category.label)}</button
	>
{/each}
{#if window.isFlutterWebView}
	<button
		class="flex w-full cursor-pointer items-center gap-5 rounded-full p-3 py-2 text-2xl text-gray-300 transition-colors hover:bg-gray-300/30 hover:text-gray-200"
		onclick={() => {
			window.flutter_inappwebview.callHandler('openSettings');
		}}
		><Icon icon="mdi:open-in-app" class="size-8" />
		{$t('settings.categories.open-wrapper-settings')}</button
	>
{/if}
