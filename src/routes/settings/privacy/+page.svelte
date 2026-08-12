<script lang="ts">
	import Toggle from '$lib/components/Toggle.svelte';
	import { linkCleaning } from '$lib/utils/linkCleaning';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';

	let cleanLinks = $state(true);

	onMount(() => {
		cleanLinks = linkCleaning.isEnabled();
	});
</script>

<div class="flex flex-col items-start gap-2">
	<p class="mt-4 mb-1 text-lg font-bold">{$t('settings.privacy.links')}</p>
	<Toggle
		bind:checked={cleanLinks}
		label={$t('settings.privacy.clean-links')}
		onchange={(checked) => linkCleaning.setEnabled(checked)}
	/>
	<p class="max-w-prose text-sm text-gray-400">
		{$t('settings.privacy.clean-links-description')}
	</p>
</div>
