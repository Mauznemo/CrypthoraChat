// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { User } from '$prisma';
import type { Server } from 'socket.io';
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
		}
		interface Error {
			message?: string;
		}
	}
	var _io: Server | null;
	var _userSocketMap: Map<string, string>;
}

export {};
