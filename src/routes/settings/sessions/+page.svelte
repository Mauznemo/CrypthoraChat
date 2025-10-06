<script lang="ts">
	import type { Session } from '$prisma';
	import { onMount } from 'svelte';
	import { getCurrentSessionId, getSessions, logoutSession } from './data.remote';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { t } from 'svelte-i18n';

	let sessions: Session[] = $state([]);
	let currentSessionId = $state('');

	onMount(async () => {
		currentSessionId = (await getCurrentSessionId()) ?? '';
		sessions = (await getSessions()) ?? [];
	});

	function handleLogout(sessionId: string) {
		if (sessionId === currentSessionId) {
			return;
		}

		modalStore.confirm($t('common.are-you-sure'), $t('settings.sessions.logout-confirm'), {
			onConfirm: async () => {
				try {
					await logoutSession(sessionId);
				} catch (error: any) {
					console.error(error);
					toastStore.error($t('settings.sessions.logout-failed') + ' ' + error.body.message);
				} finally {
					sessions = sessions.filter((s) => s.id !== sessionId);
					toastStore.success($t('settings.sessions.logout-success'));
				}
			}
		});
	}
</script>

{#if sessions.length > 0}
	<div class="flex flex-col gap-2">
		{#each sessions as session}
			{@const isActive = session.id === currentSessionId}
			<div class="flex justify-between rounded-3xl bg-gray-600/40 p-3 px-5 frosted-glass">
				<div>
					<div class="mb-2 flex items-center justify-start">
						<p class="mr-5 text-xl font-bold">{session.deviceOs || 'Unknown OS'}</p>
						{#if isActive}
							<p class="text-md font-bold text-green-300">{$t('settings.sessions.current')}</p>
						{/if}
					</div>
					<p class="text-md text-gray-200">
						{$t('settings.sessions.created')}
						{new Date(session.createdAt).toLocaleString()}
					</p>
					<p class="text-md text-gray-200">
						{$t('settings.sessions.expires')}
						{new Date(session.expiresAt).toLocaleString()}
					</p>
				</div>
				<div class="flex items-center">
					{#if !isActive}
						<button
							onclick={() => handleLogout(session.id)}
							class="cursor-pointer rounded-full bg-red-800/40 px-4 py-2 text-white frosted-glass hover:bg-red-600/40"
							>{$t('settings.sessions.logout')}</button
						>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}
