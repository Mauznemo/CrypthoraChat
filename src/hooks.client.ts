import { themeStore } from '$lib/stores/theme.svelte';

console.log('[layout.svelte] Client hooks loaded');
themeStore.loadTheme();
