import { formatHex, oklch, type Oklch } from 'culori';
type ColorShade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;
type ColorScale = Record<ColorShade, string>;

function generateColorScale(baseColor: string): ColorScale {
	const base = oklch(baseColor) as Oklch;
	const base600Lightness = base.l;

	const lightnessMap: Record<ColorShade, number> = {
		50: 0.97,
		100: 0.93,
		200: 0.86,
		300: 0.76,
		400: 0.65,
		500: 0.58,
		600: base600Lightness,
		700: 0.43,
		800: 0.36,
		900: 0.29,
		950: 0.2
	};

	const scale = {} as ColorScale;
	for (const [shade, lightness] of Object.entries(lightnessMap)) {
		const shadeNum = Number(shade) as ColorShade;
		const chromaMultiplier = shadeNum <= 100 ? 0.3 : shadeNum >= 900 ? 0.7 : 1;
		scale[shadeNum] = formatHex({
			mode: 'oklch',
			l: lightness,
			c: base.c * chromaMultiplier,
			h: base.h
		});
	}

	return scale;
}
export function setThemeAccentColor(color: string) {
	const colorScale = generateColorScale(color);
	for (const [shade, color] of Object.entries(colorScale)) {
		document.documentElement.style.setProperty(`--color-accent-${shade}`, color);
	}

	localStorage.setItem('themeBaseColor', color);
}

export function loadTheme() {
	const themeBaseColor = localStorage.getItem('themeBaseColor');
	if (themeBaseColor) {
		const colorScale = generateColorScale(themeBaseColor);
		for (const [shade, color] of Object.entries(colorScale)) {
			document.documentElement.style.setProperty(`--color-accent-${shade}`, color);
		}
	}
}

export function getThemeAccentColor(): string {
	return getComputedStyle(document.documentElement).getPropertyValue('--color-accent-600').trim();
}
