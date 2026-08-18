/**
 * Serialises `play()` and `pause()` on a media element.
 *
 * `play()` hands back a promise that rejects with an `AbortError` ("The play() request was
 * interrupted by a call to pause()") whenever playback is interrupted before it actually started.
 * Scrubbing the playhead back and forth does exactly that, and since nothing is really wrong the
 * rejection is swallowed. A pause is also held back until a pending play has settled, so the two
 * cannot race in the first place.
 */
export function createPlaybackController(getElement: () => HTMLMediaElement | undefined) {
	let pendingPlay: Promise<void> | null = null;

	async function play(): Promise<void> {
		const element = getElement();
		if (!element) return;

		try {
			pendingPlay = element.play() ?? Promise.resolve();
			await pendingPlay;
		} catch (error) {
			if ((error as DOMException)?.name !== 'AbortError') {
				console.warn('Media play failed:', error);
			}
		} finally {
			pendingPlay = null;
		}
	}

	async function pause(): Promise<void> {
		if (!getElement()) return;

		// Already handled inside play(), this only waits for it to settle.
		if (pendingPlay) await pendingPlay.catch(() => {});
		getElement()?.pause();
	}

	async function toggle(): Promise<void> {
		const element = getElement();
		if (!element) return;

		// A play that has not started yet still counts as playing, otherwise `paused` is stale and
		// the toggle would start a second playback instead of stopping the first.
		if (pendingPlay || !element.paused) await pause();
		else await play();
	}

	return { play, pause, toggle };
}
