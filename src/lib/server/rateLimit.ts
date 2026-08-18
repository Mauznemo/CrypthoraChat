/**
 * A fixed-window attempt counter, keyed by whatever the caller wants to throttle on.
 *
 * In-memory and therefore per-process, which is fine for the single-container deployment this
 * app ships as. If it is ever scaled out, every instance gets its own budget - worth knowing
 * before turning the limits down.
 */
export class RateLimiter {
	private attempts = new Map<string, { count: number; firstAt: number }>();

	constructor(
		private readonly maxAttempts: number,
		private readonly windowMs: number
	) {}

	/** True if the key has already used up its budget for the current window. */
	isLimited(key: string): boolean {
		const entry = this.attempts.get(key);
		if (!entry) return false;

		if (Date.now() - entry.firstAt > this.windowMs) {
			this.attempts.delete(key);
			return false;
		}

		return entry.count >= this.maxAttempts;
	}

	registerFailure(key: string): void {
		// Sweeping on write keeps the map bounded by the number of keys seen per window rather
		// than by every key ever seen.
		this.sweep();

		const entry = this.attempts.get(key);
		if (!entry || Date.now() - entry.firstAt > this.windowMs) {
			this.attempts.set(key, { count: 1, firstAt: Date.now() });
			return;
		}
		entry.count++;
	}

	reset(key: string): void {
		this.attempts.delete(key);
	}

	private sweep(): void {
		const now = Date.now();
		for (const [key, entry] of this.attempts) {
			if (now - entry.firstAt > this.windowMs) this.attempts.delete(key);
		}
	}
}
