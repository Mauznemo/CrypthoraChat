import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import fs from 'fs';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		version: {
			name: pkg.version
		},
		experimental: {
			remoteFunctions: true
		},
		alias: {
			$prisma: 'src/generated/prisma/client.js'
		}
	},
	compilerOptions: {
		experimental: {
			async: true
		}
	}
};

export default config;
