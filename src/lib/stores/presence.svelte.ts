import { socketStore } from '$lib/stores/socket.svelte';

/**
 * Online state of other users, as pushed by the server.
 *
 * "Online" means the app is in the foreground and the user is not idle - the same signal
 * that decides whether they get a push notification. Nothing is persisted: a user we have
 * never heard about is treated as offline.
 */
class PresenceStore {
	private states = $state<Record<string, boolean>>({});

	isOnline(userId: string | undefined | null): boolean {
		if (!userId) return false;
		return this.states[userId] === true;
	}

	set(userId: string, online: boolean): void {
		this.states[userId] = online;
	}

	/**
	 * Fetches the current state for the given users. Call on chat switch, when the info bar
	 * opens, and on reconnect - pushes that arrived while disconnected are simply lost.
	 */
	async refresh(userIds: string[]): Promise<void> {
		if (userIds.length === 0 || !socketStore.connected) return;

		try {
			const result = await socketStore.requestPresence(userIds);
			for (const userId of userIds) {
				this.states[userId] = result[userId] === 'online';
			}
		} catch (error) {
			console.error('Failed to fetch presence:', error);
		}
	}

	/** Everyone is unreachable while we have no socket, so no stale dot survives a disconnect */
	clear(): void {
		this.states = {};
	}
}

export const presenceStore = new PresenceStore();
