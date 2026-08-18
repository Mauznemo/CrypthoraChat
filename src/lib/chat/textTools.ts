import { chatStore } from '$lib/stores/chat.svelte';
import type { ChatWithoutMessages } from '$lib/types';

export function extractMentions(
	text: string
): { username: string; fullMatch: string; startIndex: number; endIndex: number }[] {
	const mentionRegex = /@(\w+)/g;
	const mentions = [];
	let match;

	while ((match = mentionRegex.exec(text)) !== null) {
		const username = match[1];
		// Only match if the username is an exact match (case insensitive)
		const participant = chatStore.activeChat?.participants.find(
			(p) => p.user.username.toLowerCase() === username.toLowerCase()
		);

		if (participant) {
			mentions.push({
				username: participant.user.username,
				fullMatch: match[0],
				startIndex: match.index,
				endIndex: match.index + match[0].length
			});
		}
	}

	return mentions;
}

function linkHref(url: string): string {
	// Add protocol if missing (for www. links)
	return url.startsWith('www.') ? `https://${url}` : url;
}

function escapeHtml(str: string): string {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtmlAttribute(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#x27;');
}

// The generated anchor is inert: no inline handler, no javascript: URL. The Flutter wrapper and
// the PWA link confirmation both hook `a[data-chat-link]` from a delegated listener in
// +layout.svelte instead, so nothing user-controlled ever ends up in a script context.
function linkHtml(text: string, url: string): string {
	const escapedHref = escapeHtmlAttribute(linkHref(url));

	return `<a href="${escapedHref}" target="_blank" rel="noopener noreferrer" data-chat-link="true" class="text-blue-400 hover:text-blue-300 underline">${text}</a>`;
}

function processLinks(text: string, placeholders: string[]): string {
	const urlRegex = /(https?:\/\/[^\s<]+|ftp:\/\/[^\s<]+|www\.[^\s<]+)/gi;

	return text.replace(urlRegex, (url) => pushPlaceholder(linkHtml(url, url), placeholders));
}

export function processMarkdown(text: string): string {
	return (
		text
			// Headings (must start at line beginning)
			.replace(/^### (.*)$/gm, '<span class="font-bold text-1xl">$1</span>')
			.replace(/^## (.*)$/gm, '<span class="font-bold text-2xl">$1</span>')
			.replace(/^# (.*)$/gm, '<span class="font-bold text-3xl">$1</span>')
			// Bold
			.replace(/\*\*(.*?)\*\*/g, '<span class="font-bold">$1</span>')
			// Italic
			.replace(/\*(.*?)\*/g, '<span class="italic">$1</span>')
			// Line breaks
			.replace(/\n/g, '<br>')
	);
}

// Generated HTML is never left inline in the text being processed - it is swapped for an opaque
// token and restored at the very end. That keeps every later pass (autolinking, mentions, tables,
// markdown) from re-matching inside markup it produced itself, which is how a mention used to end
// up spliced into a preceding link's href attribute. The sentinel is a private-use codepoint that
// is stripped from the input up front, so a message can never forge a token.
const TOKEN_MARK = '\uE000';

function pushPlaceholder(html: string, placeholders: string[]): string {
	const token = `${TOKEN_MARK}${placeholders.length}${TOKEN_MARK}`;
	placeholders.push(html);
	return token;
}

function restorePlaceholders(text: string, placeholders: string[]): string {
	return text.replace(
		/\uE000(\d+)\uE000/g,
		(match, idx: string) => placeholders[Number(idx)] ?? match
	);
}

// Markdown-style [text](url) links. Handled before bare-URL autolinking so the resulting anchor
// HTML is protected (via placeholder tokens) from being re-matched/re-wrapped by processLinks.
function processMarkdownLinks(text: string, placeholders: string[]): string {
	const mdLinkRegex = /\[([^[\]]+)\]\(((?:https?:\/\/|ftp:\/\/|www\.|\/)[^\s()]+)\)/g;

	return text.replace(mdLinkRegex, (_match, linkText: string, url: string) =>
		pushPlaceholder(linkHtml(linkText, url), placeholders)
	);
}

function isTableSeparatorRow(line: string): boolean {
	const trimmed = line.trim();
	if (!trimmed.includes('-')) return false;

	const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|');
	return cells.length > 0 && cells.every((cell) => /^\s*:?-+:?\s*$/.test(cell));
}

function splitTableRow(line: string): string[] {
	let trimmed = line.trim();
	if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
	if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
	return trimmed.split('|').map((cell) => cell.trim());
}

type TableAlign = 'left' | 'center' | 'right' | '';

function tableAlignFromSeparatorCell(cell: string): TableAlign {
	const left = cell.startsWith(':');
	const right = cell.endsWith(':');
	if (left && right) return 'center';
	if (right) return 'right';
	if (left) return 'left';
	return '';
}

function tableAlignClass(align: TableAlign): string {
	if (align === 'center') return ' text-center';
	if (align === 'right') return ' text-right';
	return '';
}

// GitHub-style markdown tables, e.g.:
// | A | B |
// |---|---|
// | 1 | 2 |
// Parsed line-by-line (not a single regex) since a table is a multi-line block.
export function processTables(text: string): string {
	const lines = text.split('\n');
	const output: string[] = [];
	let i = 0;

	while (i < lines.length) {
		const headerLine = lines[i];
		const separatorLine = lines[i + 1];

		if (
			headerLine !== undefined &&
			headerLine.includes('|') &&
			separatorLine !== undefined &&
			isTableSeparatorRow(separatorLine)
		) {
			const headers = splitTableRow(headerLine);
			const alignments = splitTableRow(separatorLine).map(tableAlignFromSeparatorCell);

			const bodyRows: string[][] = [];
			let j = i + 2;
			while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
				bodyRows.push(splitTableRow(lines[j]));
				j++;
			}

			let tableHtml =
				'<div class="overflow-x-auto mini-scrollbar my-1"><table class="border-collapse text-sm">';
			tableHtml += '<thead><tr>';
			headers.forEach((header, idx) => {
				const escapedHeader = header
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;')
					.replace(/"/g, '&quot;');
				tableHtml += `<th class="border border-white/20 px-2 py-1 font-bold${tableAlignClass(alignments[idx] ?? '')}">${escapedHeader}</th>`;
			});
			tableHtml += '</tr></thead><tbody>';
			bodyRows.forEach((row) => {
				tableHtml += '<tr>';
				row.forEach((cell, idx) => {
					const escapedCell = cell
						.replace(/&/g, '&amp;')
						.replace(/</g, '&lt;')
						.replace(/>/g, '&gt;')
						.replace(/"/g, '&quot;');
					tableHtml += `<td class="border border-white/20 px-2 py-1${tableAlignClass(alignments[idx] ?? '')}">${escapedCell}</td>`;
				});
				tableHtml += '</tr>';
			});
			tableHtml += '</tbody></table></div>';

			output.push(tableHtml);
			i = j;
		} else {
			output.push(headerLine);
			i++;
		}
	}

	return output.join('\n');
}

export function processMessageText(text: string, options?: { tables?: boolean }): string {
	// Reserved as the placeholder delimiter, so it must not survive from the message itself.
	text = text.replace(/\uE000/g, '');

	// First extract mentions to get their positions in the original text
	const mentions = extractMentions(text);

	// Sort mentions by start index in descending order
	mentions.sort((a, b) => b.startIndex - a.startIndex);

	// Start with HTML escaping
	let processedText = text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\r\n/g, '\n');

	const placeholders: string[] = [];

	// Links first, in both syntaxes. Once they are tokens the text holds no markup at all, so the
	// mention pass below cannot land inside an href.
	processedText = processMarkdownLinks(processedText, placeholders);
	processedText = processLinks(processedText, placeholders);

	// Now replace mentions in the escaped text
	mentions.forEach((mention) => {
		const escapedMention = mention.fullMatch
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');

		const mentionHtml = `<span class="bg-violet-600/50 px-2 pb-0.5 rounded-full text-gray-300 font-bold">@${escapeHtml(mention.username)}</span>`;

		// Replace the first occurrence of the escaped mention
		processedText = processedText.replace(
			escapedMention,
			pushPlaceholder(mentionHtml, placeholders)
		);
	});

	if (options?.tables !== false) {
		processedText = processTables(processedText);
	}

	// Apply markdown formatting last
	processedText = processMarkdown(processedText);

	return restorePlaceholders(processedText, placeholders);
}
