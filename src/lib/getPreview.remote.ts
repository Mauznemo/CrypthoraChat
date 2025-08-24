// First, install cheerio for server-side HTML parsing:
// npm install cheerio
// npm install -D @types/cheerio

// src/lib/getPreview.remote.ts
import { query } from '$app/server';
import * as cheerio from 'cheerio';
import * as v from 'valibot';

interface Preview {
	title: string;
	description: string;
	image?: string;
}

const PreviewSchema = v.object({
	title: v.string(),
	description: v.string(),
	image: v.optional(v.string())
});

export const getPreview = query(v.string(), async (url: string) => {
	const response = await fetch(url);
	if (!response.ok) throw new Error('Failed to fetch URL');

	const html = await response.text();
	const $ = cheerio.load(html);

	const rawTitle = $('title').text()?.trim() || 'No title found';
	const rawDescription =
		$('meta[property="og:description"]').attr('content')?.trim() ||
		$('meta[name="description"]').attr('content')?.trim() ||
		'No description available';
	const rawImage = $('meta[property="og:image"]').attr('content')?.trim() || undefined;

	const validated = v.safeParse(PreviewSchema, {
		title: rawTitle,
		description: rawDescription,
		image: rawImage
	});

	if (validated.success) {
		return validated.output;
	} else {
		throw new Error('Invalid metadata');
	}
});
