import { themeStore } from '$lib/stores/theme.svelte';
import '$lib/i18n';

console.log('[layout.svelte] Client hooks loaded');
themeStore.loadTheme();
