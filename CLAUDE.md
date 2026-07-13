# Project
And open-source self-hostable E2EE chat app for friends and family.

- SvelteKit 5 (new runes, experimental [Remote Functions](https://svelte.dev/docs/kit/remote-functions) are enabled), using Tailwind CSS and TypeScript, adapter node, using Prisma for Postgres
- svelte-i18n for localization, if editing or adding strings only do the English version (src/lib/i18n/en.json) I will do the other languages. Use $t('...') or in the script tag in objects instead of a plain string path please use tKey('...') from $lib/t-key, this way my IDE can inline the real string.
- New pages have to be added to src/sitemap.config.js
- The app has two parts, the main landing page etc in src/routes/[lang=lang]/(main) and articles in src/routes/[lang=lang]/articles.
- The app can be used in web, as a PWA or in a custom Flutter wrapper app.
- When updating the db remember to run `npx prisma migrate dev` and `npx prisma generate` if needed
- If you need to test the app while logged in please use the connected Chrome browser, it is already logged in (if not please tell me)