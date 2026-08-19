import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import AutoImport from 'unplugin-auto-import/vite';
import IconsResolver from 'unplugin-icons/resolver';
import Icons from 'unplugin-icons/vite';
import { webSocketServer } from './server/webSocketPluginVite';

export default defineConfig({
	server: {
		port: 3000
	},
	preview: {
		port: 3000
	},
	plugins: [
		tailwindcss(),
		AutoImport({
			dts: 'src/auto-imports.d.ts',
			// .svelte is not part of unplugin-auto-import's default `include`
			include: [/\.[jt]sx?$/, /\.svelte$/],
			resolvers: [IconsResolver({ prefix: 'Icon' })]
		}),
		sveltekit(),
		Icons({ compiler: 'svelte', autoInstall: false }),
		webSocketServer
	]
});
