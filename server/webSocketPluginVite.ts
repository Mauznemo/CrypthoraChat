/**
 * Boots the socket server (and the config check) for `vite dev` / `vite preview`.
 *
 * server/index.ts is the production entrypoint only, so anything it does at startup has to be
 * mirrored here or dev silently skips it - which is how an unusable PROFILE_PIC_KEY got as far as
 * a 500 from the upload endpoint instead of failing on boot.
 */
export const webSocketServer = {
	name: 'webSocketServer',
	async configureServer(server: any) {
		const env = await server.ssrLoadModule('/src/lib/server/env.ts');
		env.assertRequiredEnv();

		const module = await server.ssrLoadModule('/src/lib/server/socket.ts');
		module.initializeSocket(server.httpServer);
	}
};
