import { socketStore } from '$lib/stores/socket.svelte';

/** How long without any interaction before the session stops counting as foreground */
const IDLE_TIMEOUT_MS = 5 * 60_000;
/** Re-asserts 'active' so the server can expire clients that die without disconnecting */
const HEARTBEAT_MS = 60_000;
/** pointermove fires constantly; only one in this window is worth a timestamp write */
const MOVE_THROTTLE_MS = 5_000;

const INTERACTION_EVENTS = [
	'pointerdown',
	'pointermove',
	'keydown',
	'wheel',
	'touchstart',
	'scroll'
] as const;

/**
 * Decides whether this tab counts as "the user is here".
 *
 * `document.hidden` alone is not enough: it stays false when the window is merely behind
 * another window or parked on a second monitor, so an open tab kept the session active
 * forever and suppressed every push notification. Presence therefore also requires recent
 * interaction with the page.
 *
 * Deliberately not driven by `window.blur`: clicking devtools or a neighbouring window
 * would falsely mark the user away, and the idle timer already covers being elsewhere.
 */
class ActivityTracker {
	private running = false;
	/** Set by the native wrapper backgrounding us, which does not always flip document.hidden */
	private suspended = false;
	private lastInteraction = 0;
	private lastMoveRecorded = 0;
	private isActive = false;
	private idleTimer: ReturnType<typeof setTimeout> | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	/** Called when the tab becomes visible again, for work unrelated to presence */
	private onVisible: (() => void) | null = null;

	start(onVisible?: () => void): void {
		this.onVisible = onVisible ?? null;
		if (this.running) {
			// A remount should still re-assert presence, even though the listeners are already up.
			this.notifyInteraction();
			return;
		}
		this.running = true;

		for (const event of INTERACTION_EVENTS) {
			document.addEventListener(event, this.handleInteraction, { passive: true, capture: true });
		}
		document.addEventListener('visibilitychange', this.handleVisibilityChange);

		this.heartbeatTimer = setInterval(this.handleHeartbeat, HEARTBEAT_MS);
		this.notifyInteraction();
	}

	stop(): void {
		if (!this.running) return;
		this.running = false;
		this.onVisible = null;

		for (const event of INTERACTION_EVENTS) {
			document.removeEventListener(event, this.handleInteraction, { capture: true });
		}
		document.removeEventListener('visibilitychange', this.handleVisibilityChange);

		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.idleTimer = null;
		if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
		this.heartbeatTimer = null;

		this.setActive(false);
	}

	/**
	 * Counts as user presence without an actual DOM event. Used by the Flutter wrapper's
	 * foreground callback and on reconnect.
	 */
	notifyInteraction(): void {
		this.suspended = false;
		this.lastInteraction = Date.now();
		this.evaluate();
	}

	/**
	 * Forces the background state until the next interaction. For the native wrapper's
	 * app-backgrounded callback: without it the heartbeat would re-assert 'active' a minute
	 * later and the user would stop getting push notifications again.
	 */
	suspend(): void {
		this.suspended = true;
		this.evaluate();
	}

	/** Re-emits the current state onto a socket that has just been (re)created */
	reassert(): void {
		this.isActive = false; // The new socket is registered as background server side.
		this.evaluate();
	}

	private handleInteraction = (event: Event): void => {
		if (event.type === 'pointermove') {
			const now = Date.now();
			if (now - this.lastMoveRecorded < MOVE_THROTTLE_MS) return;
			this.lastMoveRecorded = now;
		}
		this.notifyInteraction();
	};

	private handleVisibilityChange = (): void => {
		if (document.hidden) {
			this.evaluate();
		} else {
			this.onVisible?.();
			// Coming back to the tab is itself a sign of presence.
			this.notifyInteraction();
		}
	};

	private handleHeartbeat = (): void => {
		this.evaluate();
		// Re-send even when unchanged: the server's active window expires without it.
		if (this.isActive) socketStore.setSocketSessionActive();
	};

	private evaluate(): void {
		const shouldBeActive =
			this.running &&
			!this.suspended &&
			!document.hidden &&
			Date.now() - this.lastInteraction < IDLE_TIMEOUT_MS;

		this.setActive(shouldBeActive);
		this.scheduleIdleCheck();
	}

	/** Only emits on a real transition, so a moving mouse does not spam the socket */
	private setActive(active: boolean): void {
		if (active === this.isActive) return;
		this.isActive = active;
		if (active) socketStore.setSocketSessionActive();
		else socketStore.setSocketSessionInactive();
	}

	private scheduleIdleCheck(): void {
		if (this.idleTimer) clearTimeout(this.idleTimer);
		if (!this.isActive) return;

		const remaining = this.lastInteraction + IDLE_TIMEOUT_MS - Date.now();
		this.idleTimer = setTimeout(() => this.evaluate(), Math.max(remaining, 0));
	}
}

export const activityTracker = new ActivityTracker();
