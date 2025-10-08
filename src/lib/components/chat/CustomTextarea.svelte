<script lang="ts">
	import { extractMentions } from '$lib/chat/textTools';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { onMount, tick } from 'svelte';

	let {
		value = $bindable(''),
		placeholder = 'Type your message here...',
		isMobile = false,
		disabled = false,
		maxHeight = '15rem',
		minHeight = '3rem',
		onInput,
		onKeydown,
		onFileSelected
	}: {
		value: string;
		placeholder: string;
		isMobile: boolean;
		disabled: boolean;
		maxHeight?: string;
		minHeight?: string;
		onInput: ((event: Event) => void) | undefined;
		onKeydown: ((event: KeyboardEvent) => void) | undefined;
		onFileSelected: ((file: File) => void) | undefined;
	} = $props();

	let internalValue = $state(value);
	let contentEditableDiv: HTMLDivElement;
	let isComposing = false;

	function textToHtml(text: string): string {
		console.log('text:', JSON.stringify(text));

		if (!chatStore.activeChat) {
			return text;
		}

		const mentions = extractMentions(text);

		mentions.sort((a, b) => b.startIndex - a.startIndex);

		let processedText = text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/\r\n/g, '\n');

		mentions.forEach((mention) => {
			const escapedMention = mention.fullMatch
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');

			const mentionHtml = `<span class="bg-violet-800/60 frosted-glass px-2 pb-0.5 rounded-full text-gray-300 font-bold">@${mention.username}</span>`;

			processedText = processedText.replace(escapedMention, mentionHtml);
		});

		return (
			processedText
				// Headings
				.replace(/^### (.*)$/gm, '<span class="font-bold text-1xl">### $1</span>')
				.replace(/^## (.*)$/gm, '<span class="font-bold text-2xl">## $1</span>')
				.replace(/^# (.*)$/gm, '<span class="font-bold text-3xl"># $1</span>')
				// Bold
				.replace(/\*\*(.*?)\*\*/g, '<span class="font-bold">**$1**</span>')
				// Italic
				.replace(/\*(.*?)\*/g, '<span class="italic">*$1*</span>')
				// Line breaks
				.replace(/\n/g, '<br>')
		);
	}

	function htmlToText(html: HTMLElement): string {
		console.log('innerText:', JSON.stringify(html.innerText));
		return html.innerText;
	}

	$effect(() => {
		if (value === '') {
			internalValue = '';
		}
	});

	$effect(() => {
		if (contentEditableDiv && !isComposing) {
			const currentHtml = textToHtml(internalValue);
			if (contentEditableDiv.innerHTML !== currentHtml) {
				// Save cursor position
				const selection = window.getSelection();
				let savedRange: Range | null = null;
				let caretOffset = 0;

				if (selection && selection.rangeCount > 0) {
					savedRange = selection.getRangeAt(0).cloneRange();
					// Calculate text offset from start
					const range = document.createRange();
					range.selectNodeContents(contentEditableDiv);
					range.setEnd(savedRange.startContainer, savedRange.startOffset);
					caretOffset = range.toString().length;
				}

				contentEditableDiv.innerHTML = currentHtml;

				// Restore cursor position using text offset
				if (savedRange && caretOffset >= 0) {
					try {
						const textWalker = document.createTreeWalker(
							contentEditableDiv,
							NodeFilter.SHOW_TEXT,
							null
						);

						let currentOffset = 0;
						let targetNode = textWalker.nextNode();

						while (targetNode) {
							const nodeLength = targetNode.textContent?.length || 0;
							if (currentOffset + nodeLength >= caretOffset) {
								const newRange = document.createRange();
								newRange.setStart(targetNode, caretOffset - currentOffset);
								newRange.collapse(true);
								selection?.removeAllRanges();
								selection?.addRange(newRange);
								break;
							}
							currentOffset += nodeLength;
							targetNode = textWalker.nextNode();
						}
					} catch (e) {
						placeCaretAtEnd();
					}
				}
			}
		}
	});

	function placeCaretAtEnd() {
		if (contentEditableDiv) {
			const range = document.createRange();
			const selection = window.getSelection();
			range.selectNodeContents(contentEditableDiv);
			range.collapse(false);
			selection?.removeAllRanges();
			selection?.addRange(range);
		}
	}

	function handleInput(event: Event) {
		if (isComposing) return;

		const target = event.target as HTMLDivElement;
		const newText = htmlToText(target);

		if (newText !== internalValue) {
			internalValue = newText;
			value = internalValue;
			onInput?.(event);
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			if (event.shiftKey || isMobile) {
				event.preventDefault();

				const selection = window.getSelection();
				if (selection && selection.rangeCount > 0) {
					const range = selection.getRangeAt(0);
					range.deleteContents();

					let node = range.startContainer;
					if (
						node.nodeType === Node.TEXT_NODE &&
						node.parentNode &&
						node.parentNode.nodeName === 'SPAN'
					) {
						node = node.parentNode;
					}

					const isSpan = node.nodeName === 'SPAN';

					const atNodeEnd =
						range.startContainer.textContent &&
						range.startOffset === range.startContainer.textContent.length;

					const atNodeStart = range.startOffset === 0;
					const hastNextSibling = node.nextSibling && node.nextSibling.nodeName === 'BR';

					console.log('isSpan:', isSpan);

					console.log(
						'atEnd:',
						atNodeEnd,
						range.startOffset,
						range.startContainer.textContent?.length
					);

					console.log(
						'has next node:',
						hastNextSibling,
						node.nextSibling,
						node.nextSibling?.nodeName
					);

					if (isSpan && atNodeEnd && node.nextSibling) {
						console.log('At line end inserting after');
						range.setStartAfter(node.nextSibling);
					} else if (isSpan && atNodeStart) {
						console.log('At line start inserting before');
						range.setStartBefore(node);
					} else if (isSpan) {
						range.setStartAfter(node);
					}

					const br1 = document.createElement('br');
					br1.setAttribute('id', 'br1');
					range.insertNode(br1);

					if (atNodeEnd && !hastNextSibling && (!isSpan || (isSpan && !hastNextSibling))) {
						console.log('Inserting second br');

						const br2 = document.createElement('br');
						br2.setAttribute('id', 'br2');
						range.insertNode(br2);
					}

					const newRange = document.createRange();
					if (isSpan && atNodeEnd && node.nextSibling) newRange.setStartBefore(br1);
					else newRange.setStartAfter(br1);
					newRange.collapse(true);

					selection.removeAllRanges();
					selection.addRange(newRange);

					br1.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
				}

				const newText = htmlToText(contentEditableDiv);
				if (newText !== value) {
					value = newText;
					onInput?.(new Event('input', { bubbles: true }));
				}

				return;
			}
		}
		onKeydown?.(event);
	}

	function handleCompositionStart() {
		isComposing = true;
	}

	function handleCompositionEnd() {
		isComposing = false;

		tick().then(() => {
			if (contentEditableDiv) {
				handleInput(new Event('input', { bubbles: true }));
			}
		});
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
	}

	function handleDragEnter(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();

		const files = Array.from(event.dataTransfer?.files || []);

		files.forEach((file) => {
			onFileSelected?.(file);
		});
	}

	function handlePaste(event: ClipboardEvent) {
		const clipboardData = event.clipboardData;

		if (clipboardData) {
			const items = Array.from(clipboardData.items);
			const imageItem = items.find((item) => item.type.startsWith('image/'));

			if (imageItem) {
				event.preventDefault();

				const imageFile = imageItem.getAsFile();
				if (imageFile) {
					onFileSelected?.(imageFile);
					return;
				}
			}
		}

		event.preventDefault();
		const text = event.clipboardData?.getData('text/plain') || '';

		const selection = window.getSelection();
		if (selection?.rangeCount) {
			const range = selection.getRangeAt(0);
			range.deleteContents();
			range.insertNode(document.createTextNode(text));
			range.collapse(false);
			selection.removeAllRanges();
			selection.addRange(range);
		}

		internalValue = htmlToText(contentEditableDiv);
		value = internalValue;
		onInput?.(new Event('input', { bubbles: true }));
	}

	export function focus() {
		contentEditableDiv?.focus();
	}

	export function blur() {
		contentEditableDiv?.blur();
	}

	onMount(() => {
		if (contentEditableDiv && internalValue) {
			contentEditableDiv.innerHTML = textToHtml(internalValue);
		}
	});
</script>

<div
	bind:this={contentEditableDiv}
	tabindex="0"
	contenteditable={!disabled}
	role="textbox"
	aria-multiline="true"
	aria-placeholder={placeholder}
	spellcheck="true"
	autocapitalize="sentences"
	inputmode="text"
	style:max-height={maxHeight}
	style:min-height={minHeight}
	class="no-scrollbar flex-1 resize-none overflow-y-auto rounded-4xl border bg-gray-600 px-4 pt-2.5 text-white frosted-glass placeholder:text-gray-300 empty:before:text-gray-300 empty:before:content-[attr(aria-placeholder)] focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100"
	class:cursor-not-allowed={disabled}
	oninput={handleInput}
	onkeydown={handleKeyDown}
	oncompositionstart={handleCompositionStart}
	oncompositionend={handleCompositionEnd}
	onpaste={handlePaste}
	ondragover={handleDragOver}
	ondragenter={handleDragEnter}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
></div>

<style>
	[contenteditable] {
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	[contenteditable]:focus {
		outline: none;
	}

	[contenteditable] {
		line-height: 1.5;
		font-family: inherit;
	}
</style>
