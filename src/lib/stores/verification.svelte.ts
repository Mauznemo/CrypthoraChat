import type { SafeUser } from '$lib/types';

export type VerificationStatus =
	| 'idle'
	| 'requesting'
	| 'waiting'
	| 'peer-background'
	| 'peer-offline'
	| 'peer-busy'
	| 'rate-limited'
	| 'comparing'
	| 'declined'
	| 'cancelled'
	| 'timeout'
	| 'peer-failed';

export type IncomingVerifyRequest = {
	requestId: string;
	requestorId: string;
	requestorUsername: string;
};

/**
 * Display state for the verification flow. Deliberately holds no promise resolution —
 * that lives in verifyUser's closure, so there is exactly one place that settles.
 */
class VerificationStore {
	status = $state<VerificationStatus>('idle');
	peer = $state<SafeUser | null>(null);
	requestId = $state<string | null>(null);
	incoming = $state<IncomingVerifyRequest | null>(null);
	/** Set while verifying several users in a row, for a "Verifying 2 of 3" line */
	progress = $state<{ current: number; total: number } | null>(null);

	/** Set by verifyUser while it is waiting on a decision the status UI collects */
	respond?: (action: 'retry' | 'cancel') => void;

	/** True from the moment an incoming request is shown, not just once comparison starts */
	get isBusy(): boolean {
		return this.status !== 'idle' || this.incoming !== null;
	}

	/** Starts an outgoing request and returns its id */
	beginOutgoing(peer: SafeUser): string {
		const requestId = crypto.randomUUID();
		this.peer = peer;
		this.requestId = requestId;
		this.status = 'requesting';
		return requestId;
	}

	setStatus(status: VerificationStatus): void {
		this.status = status;
	}

	/** Clears everything except progress, which spans a whole multi-user run */
	reset(): void {
		this.status = 'idle';
		this.peer = null;
		this.requestId = null;
		this.incoming = null;
		this.respond = undefined;
	}

	resetAll(): void {
		this.reset();
		this.progress = null;
	}
}

export const verificationStore = new VerificationStore();
