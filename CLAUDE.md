# Project
And open-source self-hostable E2EE chat app for friends and family.

- SvelteKit 5 (new runes, experimental [Remote Functions](https://svelte.dev/docs/kit/remote-functions) are enabled), using Tailwind CSS and TypeScript, adapter node, using Prisma for Postgres
- svelte-i18n for localization. Use $t('...') or in the script tag in objects instead of a plain string path please use tKey('...') from $lib/t-key, this way my IDE can inline the real string.
- The app is a single SvelteKit app under src/routes: the landing page at the root, the chat itself under /chat, and the rest are settings, profile, admin and the /api endpoints.
- Server code that runs outside SvelteKit (server/index.ts and everything it pulls in, including src/lib/server/socket.ts) is loaded by tsx, where the $lib alias does not resolve - use relative imports there. The Dockerfile also only copies src/lib/server, src/lib/db.ts and src/lib/utils/auth.ts into the runtime image.
- A .remote.ts file may only export remote functions; put shared helpers in a normal module.
- The app can be used in web, as a PWA or in a custom Flutter wrapper app.
- When updating the db remember to run `npx prisma migrate dev` and `npx prisma generate` if needed
- It's no longer an alpha, so all changes must keep existing user data and chats safe
- If you need to test the app while logged in please use the connected Chrome browser, it is already logged in (if not please tell me)