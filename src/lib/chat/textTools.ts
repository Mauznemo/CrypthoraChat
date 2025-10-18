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

export function processLinks(text: string): string {
	const urlRegex = /(https?:\/\/[^\s<]+|ftp:\/\/[^\s<]+|www\.[^\s<]+)/gi;

	return text.replace(urlRegex, (url) => {
		// Add protocol if missing (for www. links)
		const href = url.startsWith('www.') ? `https://${url}` : url;

		if (window.isFlutterWebView) {
			return `<a href="#" onclick="(async () => {try { await window.flutter_inappwebview.callHandler('openUrl', '${href}'); } catch (err) { console.error('Flutter handler error:', err); }})()" class="text-blue-400 hover:text-blue-300 underline">${url}</a>`;
		}

		return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline">${url}</a>`;
	});
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

export function processMessageText(text: string): string {
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

	// Process links first (before mentions to avoid conflicts)
	processedText = processLinks(processedText);

	// Now replace mentions in the escaped text
	mentions.forEach((mention) => {
		const escapedMention = mention.fullMatch
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');

		const mentionHtml = `<span class="bg-violet-600/50 px-2 pb-0.5 rounded-full text-gray-300 font-bold">@${mention.username}</span>`;

		// Replace the first occurrence of the escaped mention
		processedText = processedText.replace(escapedMention, mentionHtml);
	});

	// Apply markdown formatting last
	return processMarkdown(processedText);
}
