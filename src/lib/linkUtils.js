"use strict";
// src/lib/linkUtils.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.processLinks = processLinks;
/**
 * Converts URLs in text to clickable links
 * Supports http, https, ftp protocols and www. prefixed URLs
 */
function processLinks(text) {
    // Regular expression to match URLs
    const urlRegex = /(https?:\/\/[^\s]+|ftp:\/\/[^\s]+|www\.[^\s]+)/gi;
    return text.replace(urlRegex, (url) => {
        // Add protocol if missing (for www. links)
        const href = url.startsWith('www.') ? `https://${url}` : url;
        // Create clickable link with styling
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline">${url}</a>`;
    });
}
