/**
 * Browsers do not play a sound for web notifications on every platform (macOS being the notable
 * one, where they are completely silent), so the page plays one itself.
 *
 * The service worker cannot do this on its own, it has no audio APIs, so it asks a client to.
 *
 * This goes through the Web Audio API rather than an `Audio` element on purpose: Chrome defers
 * loading a media element while the tab is hidden, which is precisely when a notification sound is
 * needed, so an `Audio` element would just sit there at `readyState` 0 and never play.
 */

const SOUND_URL = '/sounds/notification.mp3';
const VOLUME = 0.5;

let context: AudioContext | null = null;
let clip: AudioBuffer | null = null;
let loading: Promise<void> | null = null;

function load(): Promise<void> {
	if (loading) return loading;

	loading = (async () => {
		const AudioCtx =
			window.AudioContext ??
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AudioCtx) return;

		context = new AudioCtx();
		const response = await fetch(SOUND_URL);
		clip = await context.decodeAudioData(await response.arrayBuffer());
	})().catch((error) => {
		console.log('Could not load notification sound:', error);
	});

	return loading;
}

export async function playNotificationSound(): Promise<void> {
	await load();
	if (!context || !clip) return;

	try {
		// Stays suspended when the page never had user activation, which we can do nothing about.
		if (context.state === 'suspended') await context.resume();

		const source = context.createBufferSource();
		source.buffer = clip;
		const gain = context.createGain();
		gain.gain.value = VOLUME;
		source.connect(gain).connect(context.destination);
		source.start();
	} catch (error) {
		console.log('Could not play notification sound:', error);
	}
}
