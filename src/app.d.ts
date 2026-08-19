// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import 'unplugin-icons/types/svelte';
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
		/** Set by the wrapper at document start, so it is readable during hydration. */
		flutterSafeAreaInsets?: { top: number; bottom: number, left: number, right: number };
		/** Notification that flutterSafeAreaInsets changed. Not the initial delivery - the web app
		 * reads the global itself on mount, since this may be called before it is defined. */
		onFlutterSafeAreaInsetsChanged? = () => {};
		setSocketActive? = () => {};
		setSocketInactive? = () => {};
		goToChat? = (chatId: string) => {};
		shareToChat? = (chatId: string, text: string) => {};
		reRegisterPush? = () => {};
		/** Android back, from the wrapper. Returns true when an overlay was closed and the wrapper
		 * should neither navigate back nor leave the app. Must stay synchronous, a promise does not
		 * survive the trip back over the bridge. */
		handleBackPress?: () => boolean;
		/** Chat the wrapper wants opened, set before the page mounts. Consumed on connect. */
		__pendingChatId?: string | null;
		/** Text shared to one of the Android person shortcuts, alongside __pendingChatId. */
		__pendingSharedText?: string | null;
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
