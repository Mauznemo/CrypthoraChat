export function lerp(min: number, max: number, t: number): number {
	return min + (max - min) * t;
}

export function remap(
	value: number,
	inMin: number,
	inMax: number,
	outMin: number,
	outMax: number
): number {
	const t = (value - inMin) / (inMax - inMin); // normalize to 0–1
	return lerp(outMin, outMax, t);
}
