<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { expoInOut } from 'svelte/easing';
	import { t } from 'svelte-i18n';
	import Icon from '@iconify/svelte';
	import { getUserById } from '$lib/chat/chat.remote';
	import { verifyUser } from '$lib/crypto/userVerification';
	import { modalStore } from '$lib/stores/modal.svelte';
	import { socketStore, socketListeners } from '$lib/stores/socket.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { verificationStore } from '$lib/stores/verification.svelte';
	import LoadingSpinner from './LoadingSpinner.svelte';

	const requestModalId = (requestId: string) => 'verify-request-' + requestId;

	/** Closes the request modal only if it is the one still on screen */
	function dismissRequestModal(requestId: string) {
		modalStore.removeFromQueue(requestModalId(requestId));
		if (modalStore.isModalOpen(requestModalId(requestId))) modalStore.close();
	}

	// Mounted from the root layout rather than /chat: a peer sitting on /settings or
	// /chat/new/dm used to have no listener bound and silently dropped the request.
	onMount(() => {
		const listeners = socketListeners();

		listeners.add(
			socketStore.onUserVerifyRequested(async (data) => {
				console.log('User @' + data.requestorUsername + ' requested a verification');

				// Already mid-verification: tell them rather than clobbering the open dialog.
				if (verificationStore.isBusy) {
					socketStore.respondUserVerify({
						requestId: data.requestId,
						toUserId: data.requestorId,
						response: 'busy'
					});
					return;
				}

				verificationStore.incoming = data;
				let accepted = false;

				modalStore.open({
					id: requestModalId(data.requestId),
					title: $t('chat.verification-request-title'),
					content: $t('chat.verification-request-content', {
						values: { username: data.requestorUsername }
					}),
					buttons: [
						{
							text: $t('chat.verify-now'),
							variant: 'primary',
							onClick: () => {
								accepted = true;
							}
						},
						{ text: $t('common.decline'), variant: 'secondary' }
					],
					onClose: async () => {
						// The request may have been cancelled or handled elsewhere while the
						// modal was open; incoming is cleared in that case.
						if (verificationStore.incoming?.requestId !== data.requestId) return;
						verificationStore.incoming = null;

						socketStore.respondUserVerify({
							requestId: data.requestId,
							toUserId: data.requestorId,
							response: accepted ? 'accepted' : 'declined'
						});

						if (!accepted) return;

						const user = await getUserById(data.requestorId);
						const matched = await verifyUser(user, false, data);
						if (matched) {
							toastStore.success(
								$t('chat.verification.success', { values: { username: user.username } })
							);
						}
					}
				});
			})
		);

		listeners.add(
			socketStore.onUserVerifyHandled((data) => {
				if (verificationStore.incoming?.requestId !== data.requestId) return;
				verificationStore.incoming = null;
				dismissRequestModal(data.requestId);
				toastStore.info($t('chat.verification.request-handled'));
			})
		);

		listeners.add(
			socketStore.onUserVerifyCancelled((data) => {
				if (verificationStore.incoming?.requestId !== data.requestId) return;
				const username = verificationStore.incoming.requestorUsername;
				verificationStore.incoming = null;
				dismissRequestModal(data.requestId);
				toastStore.info($t('chat.verification.cancelled', { values: { username } }));
			})
		);

		listeners.add(
			socketStore.onUserVerifyResponse((data) => {
				// The peer reporting a mismatch after we already finished is worth surfacing:
				// it is the one outcome that means "do not trust this key".
				if (data.response !== 'failed') return;
				toastStore.error(
					$t('chat.verification.peer-failed', { values: { username: data.responderUsername } })
				);
			})
		);

		return () => listeners.dispose();
	});

	const username = $derived(verificationStore.peer?.username ?? '');

	type StatusView = {
		title: string;
		body: string;
		spinner: boolean;
		retry: boolean;
		cancelLabel: string;
	};

	const view = $derived.by((): StatusView | null => {
		const values = { values: { username } };

		switch (verificationStore.status) {
			case 'requesting':
				return {
					title: $t('chat.verification.waiting-title', values),
					body: $t('chat.verification.sending'),
					spinner: true,
					retry: false,
					cancelLabel: $t('common.cancel')
				};
			case 'waiting':
				return {
					title: $t('chat.verification.waiting-title', values),
					body: $t('chat.verification.waiting', values),
					spinner: true,
					retry: false,
					cancelLabel: $t('common.cancel')
				};
			case 'peer-background':
				return {
					title: $t('chat.verification.waiting-title', values),
					body:
						$t('chat.verification.waiting', values) +
						'\n\n' +
						$t('chat.verification.peer-background', values),
					spinner: true,
					retry: false,
					cancelLabel: $t('common.cancel')
				};
			case 'peer-offline':
				return {
					title: $t('chat.verification.peer-offline-title', values),
					body: $t('chat.verification.peer-offline', values),
					spinner: false,
					retry: true,
					cancelLabel: $t('common.cancel')
				};
			case 'rate-limited':
				return {
					title: $t('chat.verification.waiting-title', values),
					body: $t('chat.verification.rate-limited'),
					spinner: false,
					retry: true,
					cancelLabel: $t('common.cancel')
				};
			case 'peer-busy':
				return {
					title: $t('chat.verification.waiting-title', values),
					body: $t('chat.verification.peer-busy', values),
					spinner: false,
					retry: false,
					cancelLabel: $t('common.ok')
				};
			case 'declined':
				return {
					title: $t('chat.verification.declined-title'),
					body: $t('chat.verification.declined', values),
					spinner: false,
					retry: false,
					cancelLabel: $t('common.ok')
				};
			case 'timeout':
				return {
					title: $t('chat.verification.timeout-title'),
					body: $t('chat.verification.timeout', values),
					spinner: false,
					retry: false,
					cancelLabel: $t('common.ok')
				};
			// 'comparing' renders nothing: EmojiVerification owns the screen then.
			default:
				return null;
		}
	});
</script>

{#if view}
	<div
		in:fade={{ duration: 200 }}
		out:fade={{ duration: 200 }}
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
	>
		<div
			in:scale={{ duration: 200, easing: expoInOut }}
			out:scale={{ duration: 200, easing: expoInOut }}
			class="mx-2 w-full max-w-md rounded-4xl bg-gray-800/60 p-6 frosted-glass-shadow"
		>
			{#if verificationStore.progress}
				<p class="mb-2 text-sm text-gray-400">
					{$t('chat.verification.progress', {
						values: {
							current: verificationStore.progress.current,
							total: verificationStore.progress.total
						}
					})}
				</p>
			{/if}

			<div class="flex items-center gap-3">
				{#if view.spinner}
					<LoadingSpinner size="1.5rem" />
				{:else}
					<Icon icon="mdi:account-alert-outline" class="size-6 shrink-0 text-gray-300" />
				{/if}
				<h3 class="text-lg font-semibold text-white">{view.title}</h3>
			</div>

			<p class="mt-4 whitespace-pre-line text-gray-300">{view.body}</p>

			<div class="mt-6 flex flex-col gap-3">
				{#if view.retry}
					<button
						onclick={() => verificationStore.respond?.('retry')}
						class="w-full cursor-pointer rounded-full bg-accent-700/60 py-3 text-white frosted-glass transition-colors hover:bg-accent-600/50"
						>{$t('common.retry')}</button
					>
				{/if}
				<button
					onclick={() => verificationStore.respond?.('cancel')}
					class="w-full cursor-pointer rounded-full bg-gray-700/60 py-3 text-white frosted-glass transition-colors hover:bg-gray-600/50"
					>{view.cancelLabel}</button
				>
			</div>
		</div>
	</div>
{/if}
