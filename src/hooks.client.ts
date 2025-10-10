import { themeStore } from '$lib/stores/theme.svelte';
import '$lib/i18n';
import { waitLocale } from 'svelte-i18n';

console.log('Client hooks loaded');
themeStore.loadTheme();

await waitLocale();
console.log('i18n initialized');
