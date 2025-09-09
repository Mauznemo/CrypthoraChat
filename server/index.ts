import http from 'http';
import express from 'express';
import { initializeSocket } from '../src/lib/server/socket';
import { handler } from '../build/handler.js';
import cors from 'cors';

const app = express();
const server = http.createServer(app);

// app.use((req, res, next) => {
// 	console.log('TRACE INCOMING ->', req.method, req.url, 'origin=', req.headers.origin);

// 	// capture stack when response ends with error status
// 	const originalEnd = res.end;
// 	res.end = function (...args: any[]) {
// 		// log status at the moment of end
// 		console.log(`TRACE RESPONSE -> ${req.method} ${req.url} status=${res.statusCode}`);
// 		if (res.statusCode >= 400) {
// 			console.log('TRACE: printing stack (where response ended).');
// 			// print a stack to show the code path
// 			console.trace();
// 		}
// 		return originalEnd.apply(this, args as any);
// 	};

// 	next();
// });

// CORS middleware
app.use(
	cors({
		origin: process.env.NODE_ENV === 'production' ? process.env.CHAT_URL : 'http://localhost:3000', // Dev server URL
		credentials: true
	})
);

initializeSocket(server);

// SvelteKit handlers
app.use(handler);

server.listen(3000, () => {
	console.log('Running on http://localhost:3000');
});
