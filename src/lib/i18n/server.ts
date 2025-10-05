import i18next from 'i18next';
import en from '$lib/i18n/en.json';
import de from '$lib/i18n/de.json';

const resources = {
	en: { translation: en },
	de: { translation: de }
};

export async function getServerTranslator(locale: string) {
	const instance = i18next.createInstance();
	await instance.init({
		lng: locale,
		fallbackLng: 'en',
		resources,
		interpolation: {
			prefix: '{',
			suffix: '}'
		}
	});

	return instance.t.bind(instance);
}
