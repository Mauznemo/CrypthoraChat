import { json } from '@sveltejs/kit';
import { getFcmClientConfig } from '$lib/server/fcm';

/**
 * Push config for the Android wrapper app.
 *
 * The wrapper ships as a single prebuilt apk, so it has no `google-services.json` baked in. It asks
 * the server it is pointed at for these values instead and calls `Firebase.initializeApp()` with
 * them at runtime. All four come out of `google-services.json`, which is not secret (it is inside
 * every apk of every Firebase app), so this route is public.
 *
 * `fcm` is null when the server operator has not set up Firebase, in which case the wrapper simply
 * doesn't offer FCM and falls back to ntfy/UnifiedPush.
 */
export async function GET() {
	return json({ fcm: getFcmClientConfig() });
}
