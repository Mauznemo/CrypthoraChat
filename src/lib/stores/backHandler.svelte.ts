import { browser } from '$app/environment';
import { addUserToChatStore } from './addUserToChat.svelte';
import { contextMenuStore } from './contextMenu.svelte';
import { documentPreviewStore } from './documentPreview.svelte';
import { emojiPickerStore } from './emojiPicker.svelte';
import { emojiVerificationStore } from './emojiVerification.svelte';
import { imagePreviewStore } from './imagePreview.svelte';
import { infoBarStore } from './infoBar.svelte';
import { keySharerStore } from './keySharer.svelte';
import { modalStore } from './modal.svelte';

export interface BackHandler {
	/** Dismisses the overlay. Must be synchronous, see `handleBackPress`. */
	close: () => void;
	/** Defaults to closable. A handler that refuses still swallows the press. */
	canClose?: () => boolean;
}

/**
 * Open overlays, oldest first. Nothing here is URL backed, so this is the only record of what is
 * stacked on top of the page.
 */
const stack: BackHandler[] = [];

/**
 * Registers an overlay as open, returns the unregister.
 *
 * For overlays whose open state lives in a component rather than a store. Call it from an
 * `$effect` and return the result, so the entry is removed when the overlay closes:
 * ```svelte
 * $effect(() => (isOpen ? pushBackHandler({ close }) : undefined));
 * ```
 */
export function pushBackHandler(handler: BackHandler): () => void {
	stack.push(handler);
	return () => {
		const index = stack.lastIndexOf(handler);
		if (index !== -1) stack.splice(index, 1);
	};
}

/**
 * Keeps a store backed overlay on the stack for as long as it is open.
 *
 * Every overlay store exposes `isOpen` and `close()`, so they can be observed from here instead of
 * each one having to register itself.
 */
function trackOverlay(isOpen: () => boolean, handler: BackHandler): void {
	$effect(() => {
		if (!isOpen()) return;
		return pushBackHandler(handler);
	});
}

/**
 * Closes the topmost overlay, returns whether the back press was consumed.
 *
 * Called by the Flutter wrapper on Android back (see `window.handleBackPress` in app.d.ts) and has
 * to stay synchronous: a promise does not survive the trip back over the bridge. `false` lets the
 * wrapper fall through to browser history, and then to leaving the app.
 */
export function handleBackPress(): boolean {
	const top = stack[stack.length - 1];
	if (!top) return false;
	// A modal that refuses to be dismissed is blocking the page, so back must not reach past it
	// either - swallowing the press is the point.
	if (top.canClose?.() === false) return true;
	top.close();
	return true;
}

// Effects cannot be owned by a component here: these overlays outlive any single page, and the
// root layout is not mounted during SSR.
if (browser) {
	$effect.root(() => {
		trackOverlay(() => modalStore.isOpen, {
			close: () => modalStore.close(),
			canClose: () => modalStore.config.dismissible !== false
		});
		trackOverlay(() => contextMenuStore.isOpen, { close: () => contextMenuStore.close() });
		trackOverlay(() => emojiPickerStore.isOpen, { close: () => emojiPickerStore.close() });
		trackOverlay(() => imagePreviewStore.isOpen, { close: () => imagePreviewStore.close() });
		trackOverlay(() => documentPreviewStore.isOpen, { close: () => documentPreviewStore.close() });
		trackOverlay(() => keySharerStore.isOpen, { close: () => keySharerStore.close() });
		// The default `matched = false` is what a dismissal means.
		trackOverlay(() => emojiVerificationStore.isOpen, {
			close: () => emojiVerificationStore.close()
		});
		trackOverlay(() => addUserToChatStore.isOpen, { close: () => addUserToChatStore.close() });
		// Persisted, so it can already be open on the first back press of a session. That is still
		// a visible panel over the chat, so closing it is the right thing to do.
		trackOverlay(() => infoBarStore.isOpen, { close: () => infoBarStore.close() });
	});
}
