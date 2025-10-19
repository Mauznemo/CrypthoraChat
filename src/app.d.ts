// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { User } from '$prisma';
import type { Server } from 'socket.io';
import type { SocketSessionData } from '$lib/server/socket';

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
		flutterSafeAreaInsets?: { top: number; bottom: number, left: number, right: number };
		onFlutterSafeAreaInsetsChanged? = () => {};
		setSocketActive? = () => {};
		setSocketInactive? = () => {};
		goToChat? = (chatId: string) => {};
	}
	var _io: Server | null;
	var _sessionSocketMap: Map<string, SocketSessionData>;
}

export {};
