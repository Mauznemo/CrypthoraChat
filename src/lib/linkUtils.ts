/**
 * Converts URLs in text to clickable links
 * Supports http, https, ftp protocols and www. prefixed URLs
 */
export function processLinksSafe(text: string): string {
	// Escape HTML entities first
	const escapeHtml = (unsafe: string): string => {
		return unsafe
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	};

	// Escape the input text first
	const escapedText = escapeHtml(text);

	// Regular expression to match URLs
	const urlRegex = /(https?:\/\/[^\s]+|ftp:\/\/[^\s]+|www\.[^\s]+)/gi;

	return escapedText.replace(urlRegex, (url) => {
		// Add protocol if missing (for www. links)
		const href = url.startsWith('www.') ? `https://${url}` : url;

		// Create clickable link with styling
		return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline">${url}</a>`;
	});
}
