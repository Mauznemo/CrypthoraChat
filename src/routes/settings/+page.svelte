<script lang="ts">
	import { goto } from '$app/navigation';
	import { getContext } from 'svelte';
	import type { PageProps } from './$types';
	import { t } from 'svelte-i18n';
	import { tKey } from '$lib/t-key';

	let { data }: PageProps = $props();

	const settingsTitle = getContext<any>('settingsTitle');
	settingsTitle.set($t('settings.settings'));

	let categories = [
		{
			label: tKey('settings.categories.appearance'),
			path: '/settings/appearance',
			icon: IconMdiColor
		},
		{
			label: tKey('settings.categories.sessions'),
			path: '/settings/sessions',
			icon: IconMdiImportantDevices
		},
		{
			label: tKey('settings.categories.storage'),
			path: '/settings/storage',
			icon: IconMdiStorage
		},
		{
			label: tKey('settings.categories.privacy'),
			path: '/settings/privacy',
			icon: IconMdiShieldLock
		},
		{
			label: tKey('settings.categories.advanced'),
			path: '/settings/advanced',
			icon: IconMdiGear
		}
	];
</script>

{#each categories as category}
	<button
		class="flex w-full cursor-pointer items-center gap-5 rounded-full p-3 py-2 text-2xl text-gray-300 transition-colors hover:bg-gray-300/30 hover:text-gray-200"
		onclick={() => {
			settingsTitle.set($t(category.label));
			goto(category.path);
		}}><category.icon class="size-8" /> {$t(category.label)}</button
	>
{/each}
{#if window.isFlutterWebView}
	<button
		class="flex w-full cursor-pointer items-center gap-5 rounded-full p-3 py-2 text-2xl text-gray-300 transition-colors hover:bg-gray-300/30 hover:text-gray-200"
		onclick={() => {
			window.flutter_inappwebview.callHandler('openSettings');
		}}
		><IconMdiOpenInApp class="size-8" />
		{$t('settings.categories.open-wrapper-settings')}</button
	>
{/if}
