export const webSocketServer = {
	name: 'webSocketServer',
	async configureServer(server: any) {
		const module = await server.ssrLoadModule('/src/lib/server/socket.ts');
		module.initializeSocket(server.httpServer);
	}
};
