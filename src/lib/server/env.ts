/* No $lib aliases in here: this module is loaded directly by server/index.ts under tsx. */

// vite only puts .env into import.meta.env, not process.env, so dev needs this to see the file.
import 'dotenv/config';

/**
 * Fails fast on missing or malformed configuration.
 *
 * Without this, a missing PROFILE_PIC_KEY surfaces as a confusing 404 the first time anyone loads
 * an avatar, and a malformed one as a decrypt failure - a long way from the actual mistake.
 */
export function assertRequiredEnv(): void {
	const missing = ['DATABASE_URL', 'PROFILE_PIC_KEY'].filter((name) => !process.env[name]);

	if (missing.length > 0) {
		throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
	}

	const key = process.env.PROFILE_PIC_KEY!;
	const decoded = Buffer.from(key, 'base64');

	// Buffer.from is lenient, so round-trip instead of trusting it to reject bad input.
	if (decoded.toString('base64').replace(/=+$/, '') !== key.replace(/=+$/, '')) {
		throw new Error(
			'PROFILE_PIC_KEY is not valid base64. ' +
				`Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
		);
	}

	if (decoded.byteLength !== 32) {
		throw new Error(
			`PROFILE_PIC_KEY must decode to 32 bytes, got ${decoded.byteLength}. ` +
				`Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
		);
	}
}
