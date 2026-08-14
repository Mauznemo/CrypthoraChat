// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { User } from '$prisma';
import type { Server } from 'socket.io';
import type { ClientPresence, SocketSessionData } from '$lib/server/socket';

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
		interface Locals {
			user?: User;
			sessionId?: string;
			locale?: string;
		}
		interface Error {
			message?: string;
		}
	}
	interface Window {
		isFlutterWebView?: boolean;
		wrapperVersion?: string;
		flutter_inappwebview?: any;
		ntfyTopic?: string;
		fcmToken?: string;
		flutterSafeAreaInsets?: { top: number; bottom: number, left: number, right: number };
		onFlutterSafeAreaInsetsChanged? = () => {};
		setSocketActive? = () => {};
		setSocketInactive? = () => {};
		goToChat? = (chatId: string) => {};
		reRegisterPush? = () => {};
	}
	var _io: Server | null;
	/** Keyed by socket.id, one entry per live connection (a session can have many tabs) */
	var _socketMap: Map<string, SocketSessionData>;
	/** Last presence value broadcast per user, so unchanged transitions emit nothing */
	var _presenceCache: Map<string, ClientPresence>;
	/** Interval that expires stale 'active' sockets; kept global so HMR cannot stack timers */
	var _presenceSweeper: NodeJS.Timeout | null;
}

export {};
