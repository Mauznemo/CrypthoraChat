import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { NotificationDate } from './pushNotifications';

/**
 * Google FCM (HTTP v1) sender.
 *
 * Config comes from two env vars, both of which accept either raw JSON or base64 encoded JSON:
 * - `FCM_SERVICE_ACCOUNT` (or `FCM_SERVICE_ACCOUNT_PATH`): the service account private key from
 *   Firebase > Project settings > Service accounts. Secret, only used to send.
 * - `FCM_CLIENT_CONFIG`: the whole `google-services.json`. Not secret (it ships inside every APK),
 *   its four relevant values are served to the wrapper app by `/api/push-config` so it can call
 *   `Firebase.initializeApp()` at runtime instead of needing the file baked in at build time.
 */

/** The values the wrapper app needs to initialize Firebase at runtime. */
export interface FcmClientConfig {
	projectId: string;
	appId: string;
	apiKey: string;
	messagingSenderId: string;
}

interface ServiceAccount {
	project_id: string;
	client_email: string;
	private_key: string;
}

const WRAPPER_PACKAGE_NAME = 'dev.mauznemo.crypthora_chat_wrapper';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/** Parses a value that may be raw JSON or base64 encoded JSON. */
function parseJsonOrBase64(value: string, label: string): any | null {
	const trimmed = value.trim();
	try {
		if (trimmed.startsWith('{')) return JSON.parse(trimmed);
		return JSON.parse(Buffer.from(trimmed, 'base64').toString('utf-8'));
	} catch (error) {
		console.error(`Failed to parse ${label} (expected JSON or base64 encoded JSON):`, error);
		return null;
	}
}

function loadServiceAccount(): ServiceAccount | null {
	const path = process.env.FCM_SERVICE_ACCOUNT_PATH;
	const raw = path ? readFileSync(path, 'utf-8') : process.env.FCM_SERVICE_ACCOUNT;
	if (!raw) return null;

	const parsed = parseJsonOrBase64(raw, 'FCM_SERVICE_ACCOUNT');
	if (!parsed?.client_email || !parsed?.private_key || !parsed?.project_id) {
		console.error('FCM_SERVICE_ACCOUNT is missing client_email, private_key or project_id');
		return null;
	}
	return parsed as ServiceAccount;
}

/** Pulls the four client values out of a `google-services.json`. */
function loadClientConfig(): FcmClientConfig | null {
	const raw = process.env.FCM_CLIENT_CONFIG;
	if (!raw) return null;

	const parsed = parseJsonOrBase64(raw, 'FCM_CLIENT_CONFIG');
	if (!parsed?.project_info || !Array.isArray(parsed?.client) || parsed.client.length === 0) {
		console.error('FCM_CLIENT_CONFIG does not look like a google-services.json');
		return null;
	}

	const client =
		parsed.client.find(
			(c: any) => c?.client_info?.android_client_info?.package_name === WRAPPER_PACKAGE_NAME
		) ?? parsed.client[0];

	const config: FcmClientConfig = {
		projectId: parsed.project_info.project_id,
		messagingSenderId: parsed.project_info.project_number,
		appId: client?.client_info?.mobilesdk_app_id,
		apiKey: client?.api_key?.[0]?.current_key
	};

	if (!config.projectId || !config.messagingSenderId || !config.appId || !config.apiKey) {
		console.error('FCM_CLIENT_CONFIG is missing project_id, project_number, app id or api key');
		return null;
	}

	return config;
}

const serviceAccount = loadServiceAccount();
const clientConfig = loadClientConfig();

if (serviceAccount && !clientConfig) {
	console.warn('FCM_SERVICE_ACCOUNT is set but FCM_CLIENT_CONFIG is not, FCM push is disabled');
} else if (!serviceAccount && clientConfig) {
	console.warn('FCM_CLIENT_CONFIG is set but FCM_SERVICE_ACCOUNT is not, FCM push is disabled');
} else if (serviceAccount && clientConfig) {
	console.log('FCM push enabled for project:', clientConfig.projectId);
}

/** Both halves of the config are present, so FCM can be offered and used. */
export function isFcmConfigured(): boolean {
	return serviceAccount !== null && clientConfig !== null;
}

/** The non secret values handed to the wrapper app, or null if FCM is not set up. */
export function getFcmClientConfig(): FcmClientConfig | null {
	return isFcmConfigured() ? clientConfig : null;
}

function base64Url(input: string | Buffer): string {
	return Buffer.from(input)
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Signs a JWT with the service account key and trades it for an OAuth2 access token. */
async function getAccessToken(): Promise<string | null> {
	if (!serviceAccount) return null;
	// Refresh a minute early so a token can't expire mid flight.
	if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

	const now = Math.floor(Date.now() / 1000);
	const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
	const claims = base64Url(
		JSON.stringify({
			iss: serviceAccount.client_email,
			scope: SCOPE,
			aud: TOKEN_URL,
			iat: now,
			exp: now + 3600
		})
	);

	try {
		const signer = createSign('RSA-SHA256');
		signer.update(`${header}.${claims}`);
		const signature = base64Url(signer.sign(serviceAccount.private_key));
		const assertion = `${header}.${claims}.${signature}`;

		const response = await fetch(TOKEN_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
				assertion
			})
		});

		if (!response.ok) {
			console.error('Failed to get FCM access token:', response.status, await response.text());
			return null;
		}

		const body = await response.json();
		cachedToken = {
			value: body.access_token,
			expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000
		};
		return cachedToken.value;
	} catch (error) {
		console.error('Error getting FCM access token:', error);
		return null;
	}
}

/**
 * Sends a data only push to a single device.
 *
 * Data only (no `notification` block) on purpose: the wrapper app builds the notification itself so
 * it can coalesce bursts, keep an unread count and use MessagingStyle. A `notification` block would
 * make Android draw its own plain notification instead. `priority: HIGH` is what gets it through doze.
 *
 * Returns `invalidToken` when the device token is gone, so the caller can drop the subscription.
 */
export async function sendFcmNotification(
	token: string,
	data: NotificationDate
): Promise<{ ok: boolean; invalidToken: boolean }> {
	if (!serviceAccount || !clientConfig) return { ok: false, invalidToken: false };

	const accessToken = await getAccessToken();
	if (!accessToken) return { ok: false, invalidToken: false };

	// Every value in an FCM data payload has to be a string.
	const payload: Record<string, string> = {
		groupType: data.groupType,
		username: data.username,
		chatId: data.chatId,
		timestamp: String(data.timestamp)
	};
	if (data.imageUrl) payload.imageUrl = data.imageUrl;
	if (data.chatName) payload.chatName = data.chatName;

	try {
		const response = await fetch(
			`https://fcm.googleapis.com/v1/projects/${clientConfig.projectId}/messages:send`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${accessToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					message: {
						token,
						android: { priority: 'HIGH' },
						data: payload
					}
				})
			}
		);

		if (response.ok) {
			console.log('FCM notification sent successfully');
			return { ok: true, invalidToken: false };
		}

		const body = await response.text();
		console.error('Failed to send FCM notification:', response.status, body);
		const invalidToken =
			response.status === 404 ||
			(response.status === 400 && body.includes('INVALID_ARGUMENT')) ||
			body.includes('UNREGISTERED');
		return { ok: false, invalidToken };
	} catch (error) {
		console.error('Error sending FCM notification:', error);
		return { ok: false, invalidToken: false };
	}
}
