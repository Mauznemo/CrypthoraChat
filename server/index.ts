import http from 'http';
import express from 'express';
import { initializeSocket } from './socket';
import { handler } from '../build/handler.js';
import cors from 'cors';

const app = express();
const server = http.createServer(app);

// Add CORS middleware
app.use(
	cors({
		origin:
			process.env.NODE_ENV === 'production'
				? ['https://chat.mauznemo-server.de'] // Replace with your actual production domain
				: 'http://localhost:5173', // Dev server URL
		credentials: true
	})
);
initializeSocket(server);

// SvelteKit handlers
app.use(handler);

server.listen(3000, () => {
	console.log('Running on http://localhost:3000');
});
