import http from 'http';
import express from 'express';
import { initializeSocket } from './socket';
import { handler } from '../build/handler.js';

const app = express();
const server = http.createServer(app);

initializeSocket(server);

// SvelteKit handlers
app.use(handler);

server.listen(3000, () => {
	console.log('Running on http://localhost:3000');
});
