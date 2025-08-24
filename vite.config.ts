import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { webSocketServer } from './server/webSocketPluginVite';

export default defineConfig({
	server: {
		port: 3000
	},
	preview: {
		port: 3000
	},
	plugins: [tailwindcss(), sveltekit(), webSocketServer]
});
