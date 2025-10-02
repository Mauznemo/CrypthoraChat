import { formatHex, oklch, type Oklch } from 'culori';
type ColorShade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;
type ColorScale = Record<ColorShade, string>;

class Theme {
	private generateColorScale(baseColor: string): ColorScale {
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

	backgroundType: 'circles' | 'gradient' | 'solid' = $state('circles');
	themeLoaded = $state(false);

	setThemeAccentColor(color: string) {
		const colorScale = this.generateColorScale(color);
		for (const [shade, color] of Object.entries(colorScale)) {
			document.documentElement.style.setProperty(`--color-accent-${shade}`, color);
		}

		localStorage.setItem('themeBaseColor', color);
	}

	loadTheme() {
		const backgroundType = localStorage.getItem('backgroundType');
		if (backgroundType) {
			this.backgroundType = backgroundType as 'circles' | 'gradient' | 'solid';
		}

		for (let i = 1; i <= 2; i++) {
			const backgroundColor = localStorage.getItem(`backgroundColor${i}`);
			if (backgroundColor) {
				document.documentElement.style.setProperty(`--color-background-${i}`, backgroundColor);
			}
		}

		const themeBaseColor = localStorage.getItem('themeBaseColor');
		if (themeBaseColor) {
			const colorScale = this.generateColorScale(themeBaseColor);
			for (const [shade, color] of Object.entries(colorScale)) {
				document.documentElement.style.setProperty(`--color-accent-${shade}`, color);
			}
		}
		console.log('Theme loaded');
		this.themeLoaded = true;
	}

	getThemeAccentColor(): string {
		return getComputedStyle(document.documentElement).getPropertyValue('--color-accent-600').trim();
	}

	setBackgroundType(type: 'circles' | 'gradient' | 'solid') {
		this.backgroundType = type;
		localStorage.setItem('backgroundType', type);
	}

	getBackgroundType(): 'circles' | 'gradient' | 'solid' {
		return this.backgroundType;
	}

	setBackgroundColor(index: number, color: string) {
		document.documentElement.style.setProperty(`--color-background-${index}`, color);
		localStorage.setItem(`backgroundColor${index}`, color);
	}

	getBackgroundColor(index: number): string {
		return getComputedStyle(document.documentElement)
			.getPropertyValue('--color-background-' + index)
			.trim();
	}
}

export const themeStore = new Theme();
