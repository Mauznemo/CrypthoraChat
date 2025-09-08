import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';

/** @type {import('./$types').RequestHandler} */
export async function GET() {
	try {
		const health = {
			status: 'healthy',
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
			environment: dev ? 'development' : 'production',
			version: process.env.npm_package_version || '1.0.0'
		};

		return json(health, {
			status: health.status === 'healthy' ? 200 : 503
		});
	} catch (error: any) {
		return json(
			{
				status: 'unhealthy',
				error: error.message,
				timestamp: new Date().toISOString()
			},
			{
				status: 503
			}
		);
	}
}
