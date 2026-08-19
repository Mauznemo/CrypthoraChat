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
		// The second line of defence behind output escaping. SvelteKit adds a nonce to its own
		// inline scripts, so no 'unsafe-inline' is needed for script-src.
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				// wasm-unsafe-eval: the sticker editor's background removal runs an ONNX model.
				'script-src': ['self', 'wasm-unsafe-eval'],
				'style-src': ['self'],
				// Svelte writes dynamic values into style="" attributes (message reaction offsets,
				// the preview sizing). Kept separate from style-src, which carries a nonce -
				// 'unsafe-inline' would be ignored there.
				'style-src-attr': ['unsafe-inline'],
				// blob: for decrypted attachment previews, data: for generated QR codes.
				'img-src': ['self', 'data:', 'blob:'],
				'media-src': ['self', 'blob:'],
				'font-src': ['self', 'data:'],
				// blob: for the pdf.js worker and the ONNX runtime's workers.
				'worker-src': ['self', 'blob:'],
				// staticimgly.com hosts the background-removal wasm and model files.
				'connect-src': ['self', 'https://staticimgly.com'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'frame-ancestors': ['none'],
				'object-src': ['none']
			}
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
