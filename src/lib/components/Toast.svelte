<script lang="ts">
	import { toastStore } from '$lib/stores/toast.svelte';
	import { fly } from 'svelte/transition';

	const { toasts } = $derived({
		toasts: toastStore.toasts
	});
</script>

{#if toasts.length > 0}
	<div class="fixed top-4 right-4 z-50 flex flex-col gap-2">
		{#each toasts as toast (toast.id)}
			<button
				onclick={() => toastStore.dismiss(toast.id)}
				aria-label="Dismiss"
				transition:fly|global={{ duration: 200, x: 200 }}
				class="flex max-w-md min-w-80 items-start gap-3 rounded-2xl p-4 text-start frosted-glass-shadow
          {toast.type === 'success' ? 'border border-green-700 bg-green-900/60' : ''}
          {toast.type === 'error' ? 'border border-red-700 bg-red-900/60' : ''}
          {toast.type === 'warning' ? 'border border-yellow-700 bg-yellow-900/60' : ''}
          {toast.type === 'info' ? 'border border-blue-700 bg-blue-900/60' : ''}"
			>
				<div class="flex-1">
					{#if toast.title}
						<h3
							class="text-sm font-semibold
              {toast.type === 'success' ? ' text-green-100' : ''}
              {toast.type === 'error' ? ' text-red-100' : ''}
              {toast.type === 'warning' ? ' text-yellow-100' : ''}
              {toast.type === 'info' ? ' text-blue-100' : ''}"
						>
							{toast.title}
						</h3>
					{/if}
					<p
						class="text-sm
            {toast.type === 'success' ? ' text-green-200' : ''}
            {toast.type === 'error' ? ' text-red-200' : ''}
            {toast.type === 'warning' ? ' text-yellow-200' : ''}
            {toast.type === 'info' ? ' text-blue-200' : ''}"
					>
						{toast.message}
					</p>
				</div>
			</button>
		{/each}
	</div>
{/if}
