import { GLOBAL_RULE, HOST_RULES, type ParamMatchers } from './trackingRules';

/**
 * Removes known tracking query parameters from every URL found in a block of text.
 *
 * Design notes:
 * - Denylist-only. Unknown parameters are always kept (see trackingRules.ts).
 * - Surgical. The output is spliced from raw slices of the input, never rebuilt via
 *   `new URL().href`, which would normalise the URL (trailing slashes, re-encoding,
 *   default ports) and silently mutate text the user typed. `URL` is used only to read
 *   the hostname for rule lookup.
 * - Fail closed. Any parse error returns the input untouched. Losing a tracker is nice,
 *   corrupting someone's message is not.
 * - Paths and hash fragments are never touched.
 */

export interface StripResult {
	text: string;
	/** Total number of parameters removed across all URLs. */
	removedCount: number;
	/** Number of URLs that changed. */
	changedUrls: number;
	/** Unique removed parameter names, lowercased. Useful for debugging. */
	removedParams: string[];
}

/** Only scan URLs we can reason about: no whitespace, quotes or angle brackets. */
const URL_SCAN = /(?:https?:\/\/|www\.)[^\s<>"'`\\]+/gi;

const TRAILING_PUNCTUATION = `.,;:!?'"`;
const CLOSING_BRACKETS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

const MAX_TEXT_LENGTH = 100_000;

function unchanged(text: string): StripResult {
	return { text, removedCount: 0, changedUrls: 0, removedParams: [] };
}

function hostMatches(hostname: string, host: string): boolean {
	return hostname === host || hostname.endsWith('.' + host);
}

/**
 * Splits sentence punctuation off the end of a URL match, so `see https://x.com/a?si=1.`
 * cleans correctly. A closing bracket is only treated as punctuation when it is
 * unbalanced, which keeps `/wiki/Foo_(band)` intact.
 */
function splitTrailingPunctuation(raw: string): [string, string] {
	let end = raw.length;

	while (end > 0) {
		const char = raw[end - 1];

		if (TRAILING_PUNCTUATION.includes(char)) {
			end--;
			continue;
		}

		const opening = CLOSING_BRACKETS[char];
		if (opening) {
			const before = raw.slice(0, end - 1);
			const opens = before.split(opening).length - 1;
			const closes = before.split(char).length - 1;
			if (closes >= opens) {
				end--;
				continue;
			}
		}

		break;
	}

	return [raw.slice(0, end), raw.slice(end)];
}

function decodeKey(rawKey: string): string {
	try {
		return decodeURIComponent(rawKey.replace(/\+/g, ' '));
	} catch {
		return rawKey;
	}
}

interface Matchers {
	names: Set<string>;
	prefixes: string[];
	keep: Set<string>;
}

function collectMatchers(url: URL): Matchers {
	const names = new Set<string>();
	const prefixes: string[] = [];
	const keep = new Set<string>();

	const add = (matchers: ParamMatchers) => {
		matchers.params?.forEach((param) => names.add(param.toLowerCase()));
		matchers.prefixes?.forEach((prefix) => prefixes.push(prefix.toLowerCase()));
	};

	add(GLOBAL_RULE);

	for (const rule of HOST_RULES) {
		if (!rule.hosts.some((host) => hostMatches(url.hostname, host))) continue;
		if (rule.appliesTo && !rule.appliesTo(url)) continue;

		add(rule);
		rule.keep?.forEach((param) => keep.add(param.toLowerCase()));
	}

	return { names, prefixes, keep };
}

function isTracker(key: string, matchers: Matchers): boolean {
	if (matchers.keep.has(key)) return false;
	if (matchers.names.has(key)) return true;
	return matchers.prefixes.some((prefix) => key.startsWith(prefix));
}

/**
 * Cleans a single URL. Returns `null` when nothing was removed, so the caller can keep
 * the original string bit for bit.
 */
function cleanUrl(match: string): { url: string; removed: string[] } | null {
	const [core, trailing] = splitTrailingPunctuation(match);

	const hashAt = core.indexOf('#');
	const hash = hashAt >= 0 ? core.slice(hashAt) : '';
	const preHash = hashAt >= 0 ? core.slice(0, hashAt) : core;

	const queryAt = preHash.indexOf('?');
	if (queryAt < 0) return null;

	const base = preHash.slice(0, queryAt);
	const rawQuery = preHash.slice(queryAt + 1);
	if (!rawQuery) return null;

	const parsed = new URL(core.toLowerCase().startsWith('www.') ? `https://${core}` : core);
	const matchers = collectMatchers(parsed);

	const kept: string[] = [];
	const removed: string[] = [];

	for (const segment of rawQuery.split('&')) {
		if (segment === '') continue;

		const equalsAt = segment.indexOf('=');
		const rawKey = equalsAt === -1 ? segment : segment.slice(0, equalsAt);
		const key = decodeKey(rawKey).toLowerCase();

		if (isTracker(key, matchers)) {
			removed.push(key);
		} else {
			// The original raw segment, so encoding is preserved exactly.
			kept.push(segment);
		}
	}

	if (removed.length === 0) return null;

	const query = kept.join('&');
	return { url: base + (query ? `?${query}` : '') + hash + trailing, removed };
}

export function stripTrackingParams(text: string): StripResult {
	if (!text || text.length > MAX_TEXT_LENGTH) return unchanged(text);
	if (!text.includes('http') && !text.includes('www.')) return unchanged(text);

	try {
		const removedParams = new Set<string>();
		let removedCount = 0;
		let changedUrls = 0;

		const cleaned = text.replace(URL_SCAN, (match) => {
			try {
				const result = cleanUrl(match);
				if (!result) return match;

				result.removed.forEach((param) => removedParams.add(param));
				removedCount += result.removed.length;
				changedUrls++;

				return result.url;
			} catch {
				// One unparseable URL must not affect the rest of the text.
				return match;
			}
		});

		if (removedCount === 0) return unchanged(text);

		return { text: cleaned, removedCount, changedUrls, removedParams: [...removedParams] };
	} catch {
		return unchanged(text);
	}
}
