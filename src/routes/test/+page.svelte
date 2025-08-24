<!-- +page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { getPreview } from '$lib/getPreview.remote';

	interface Preview {
		title: string;
		description: string;
		image?: string;
	}

	const url = 'https://x.ai'; // Hardcoded URL example

	let preview = $state<Preview | null>(null);
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			preview = await getPreview(url);
		} catch (err) {
			console.error(err);
			error = 'Failed to load preview';
		}
	});
</script>

{#if error}
	<p class="text-red-500">{error}</p>
{:else if preview}
	<a
		href={url}
		target="_blank"
		rel="noopener noreferrer"
		class="mx-auto block max-w-md overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md transition-shadow duration-200 hover:shadow-lg"
	>
		{#if preview.image}
			<img src={preview.image} alt="Preview image" class="h-40 w-full object-cover" />
		{/if}
		<div class="p-4">
			<h3 class="truncate text-lg font-semibold text-gray-900">{preview.title}</h3>
			<p class="mt-1 line-clamp-2 text-sm text-gray-600">{preview.description}</p>
			<p class="mt-2 truncate text-xs text-gray-400">{url}</p>
		</div>
	</a>
{:else}
	<p class="text-gray-500">Loading preview...</p>
{/if}
