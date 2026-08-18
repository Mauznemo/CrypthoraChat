# CrypthoraChat — Pre-v0.1.0 Review

**Reviewed commit:** `b329a02` (v0.0.1-alpha.27) · **Date:** 2026-08-18
**Scope:** full codebase — auth, remote functions, REST endpoints, Socket.IO layer, client crypto, rendering, deployment config, dependencies.
**Nothing was changed.** This is a findings list only.

---

## Summary

The architecture is sound and a lot of the hard parts (key versioning, TOFU emoji verification, presence peer-scoping, subscription lifecycle) are done carefully — several of them noticeably more carefully than the surrounding code, judging by the comments explaining past bugs.

The problems cluster in three places:

1. **The Socket.IO layer has almost no authorization.** Remote functions (`*.remote.ts`) check chat membership fairly consistently; the socket handlers largely do not. This is the single biggest gap.
2. **File paths are attacker-controlled almost everywhere.** Client-supplied paths flow into `mkdir`, `unlink`, and `createReadStream` with either no base-directory check or a bypassable one.
3. **The message renderer builds HTML by string concatenation with incomplete escaping.** This is a stored XSS in an app whose entire threat model rests on the client not being compromised — an XSS here yields the master seed from IndexedDB, which yields every chat key and every message.

Counts: **6 critical**, **11 high**, **14 medium**, **12 low/informational**.

I'd treat the criticals and highs as blockers for calling this 0.1.0, since a version number without "alpha" in it reads as an invitation to self-host it for real.

---

# CRITICAL

### C1 — Stored XSS in message rendering via unescaped `"` in link hrefs

`src/lib/chat/textTools.ts:170` (`processMessageText`), rendered with `{@html}` at
`ChatMessage.svelte:132`, `MyChatMessage.svelte:128`, `Reply.svelte:28`.

Escaping at line 179 covers only `&`, `<`, `>`. Quotes are not escaped. The URL autolinker
(line 47) matches `[^\s<]+`, and the result is interpolated straight into an attribute:

```js
return `<a href="${href}" target="_blank" ... >${text}</a>`;
```

A message containing:

```
https://example.com/"onmouseover="alert(document.domain)
```

produces `<a href="https://example.com/" onmouseover="alert(...)" ...>` — arbitrary event
handler injection, stored, fires for every member of the chat.

**Impact is not "an alert box."** The master seed lives unencrypted in IndexedDB
(`src/lib/crypto/master.ts`). Script execution in the app origin reads the seed → derives the
master key → decrypts every stored chat key → decrypts the entire message history on that
device, and can exfiltrate the seed to give the attacker permanent passive access to all
future messages in every chat they share. This collapses the E2EE guarantee entirely.

### C2 — XSS in the Flutter wrapper via unescaped `'` in the `onclick` bridge call

`src/lib/chat/textTools.ts:36-42`.

```js
return `<a href="#" onclick="(async () => {... callHandler('openUrl', '${href}'); ...})()" ...>`;
```

`href` is user-controlled and single quotes are not escaped. A message containing
`https://x.com/');alert(1);//` breaks out of the JS string literal. Worse than C1: this runs
inside the wrapper's WebView with `window.flutter_inappwebview` in scope, so the payload can
call whatever native handlers the wrapper exposes, not just read IndexedDB.

### C3 — Attribute injection via mentions inside URLs

`src/lib/chat/textTools.ts:191-202`. Mentions are substituted *after* links have been turned
into anchor HTML, and `mentionHtml` contains double quotes:

```js
const mentionHtml = `<span class="bg-violet-600/50 ...">@${mention.username}</span>`;
```

A message like `https://example.com/@alice` (where `alice` is a chat participant) inserts that
span *inside the `href="..."` attribute value*, and the `"` in `class="` terminates the
attribute early → same outcome as C1. Reachable without the attacker controlling any quote
character themselves.

### C4 — Any chat member can delete arbitrary files on the server

`src/lib/server/socket.ts:540-566` (`send-message`) and `:699-710` (`delete-message`).

`attachmentPaths` is accepted verbatim from the client and stored. On deletion, every stored
path is passed to `removeFile()`, which is `path.resolve()` + `fs.unlink()` with **no base
directory check** (`src/lib/server/fileUpload.ts:31-38`).

Attack: send a message to a chat you are legitimately in with
`attachmentPaths: ['/uploads/profiles/<victim-uuid>.png.enc']` (or any path the node user can
write to), then delete your own message. The server unlinks the target. Repeatable, and the
attacker only needs to be a member of any one chat.

The same primitive exists in three other places, listed under H4.

### C5 — Path traversal in upload directory creation

`src/routes/api/upload-encrypted-file/+server.ts:117,128`.

```js
relativePath = `/media/${chatId}`;
...
const filename = `${randomUUID()}_${locals.user!.id}_${encryptedFileNameSafeBase64}.${fileExtension}.enc`;
```

`chatId`, `fileExtension` and `encryptedFileNameSafeBase64` are unvalidated multipart fields.
`ensureUploadDir()` then does `mkdir -p` on the joined path, and `createWriteStream` writes
there. `chatId = "../../../../home/node"` creates directories and writes attacker-controlled
bytes outside the uploads volume. `fileExtension` containing `/` extends this further.

There is also **no check that the uploader is a participant of `chatId`** — orthogonal to the
traversal, but it means anyone can write into any chat's media directory.

### C6 — `pdfjs-dist` 6.1.200: arbitrary JS execution from a malicious PDF

`package.json` pins `^6.1.200`; installed 6.1.200. GHSA advisory covers `>=5.6.83 <6.2.108`.
`src/lib/components/chat/PdfCanvas.svelte:52` calls `getDocument()` with default options
(`isEvalSupported` not disabled) on attacker-supplied files.

Any chat member can send a crafted PDF; the moment the recipient previews it, script runs in
the app origin → master seed exfiltration, as in C1. Given that PDF preview is a headline
feature, this is directly reachable. Upgrade to ≥6.2.108 and set `isEvalSupported: false`.

---

# HIGH

### H1 — `join-chat` performs no authorization

`src/lib/server/socket.ts:379-382`:

```js
socket.on('join-chat', (chatId: string) => { socket.join(chatId); });
```

Any authenticated user can join the Socket.IO room of **any** chat by ID and will then
receive `new-message`, `message-updated`, `message-deleted`, `messages-read`,
`user-typing`, `new-system-message` and `chat-updated` for a conversation they are not in.

Message *bodies* stay encrypted, but the leak is substantial: full ciphertexts (harvest now,
decrypt if a key ever leaks), sender identities and usernames, chat name and type, exact
timestamps, attachment paths, read receipts, and **plaintext system messages** — which include
strings like `"alice added @bob to the chat"` and `"@carol left the chat"`. That is the social
graph of a private group, live.

Chat IDs are UUIDv4 so they aren't guessable by brute force, but they leak readily: they
appear in `attachmentPaths` (`/uploads/media/<chatId>/...`), in push notification payloads,
and in URLs. A user removed from a group also keeps their ID forever and can silently rejoin
the room after removal.

### H2 — `logoutSession` deletes any session by ID, with no ownership check

`src/routes/settings/sessions/data.remote.ts:39-62`. The handler confirms the *caller's* own
session is valid and then deletes whatever `sessionId` the caller passed:

```js
await db.session.delete({ where: { id: sessionId } });
```

Nothing ties `sessionId` to `locals.user.id`. Any authenticated user can terminate any other
user's session. Combined with H3 (predictable session IDs) this is a targeted account-lockout
primitive; even without H3, enumerating cuids is far from impossible.

### H3 — Session tokens are `cuid()`, not cryptographically random

`prisma/schema.prisma`, `model Session { id String @id @default(cuid()) }`.

cuid v1 is a *collision-resistant* identifier, explicitly **not** a security token: it is
timestamp + per-process counter + host fingerprint + a small amount of `Math.random()`. Its
author has publicly deprecated it for exactly this reason. The session cookie is the sole
bearer credential for a 6-month-lived session.

Use `crypto.randomBytes(32).toString('base64url')` and set it explicitly on create. Same
applies to `NotificationSubscription.id`. (`User.id` and `Chat.id` as cuid/uuid are fine —
they aren't secrets, though see H1 for why chat IDs leak usefully.)

### H4 — Three more arbitrary-file-deletion paths

Same `removeFile()` primitive as C4, reached through stored paths that the client fully
controls and that are never validated against the uploads root:

| Sink | Path source |
|---|---|
| `stickers.remote.ts:36` `deleteUserSticker` | `stickerEditor.remote.ts:6` `saveUserSticker(path)` — accepts any string |
| `profile/data.remote.ts:31` `updateProfilePicture` | previous `profilePicPath`, itself set from an arbitrary client string |
| `chat.remote.ts:updateGroupImage` | previous `chat.imagePath`, set from an arbitrary client string in `createGroup` / `updateGroupImage` |

Each is a two-step: store the path you want deleted, then trigger the replace/delete. All
require only a normal authenticated account.

### H5 — Sticker commands have no ownership check (IDOR)

`src/lib/chat/stickers.remote.ts:36,67,84`. `deleteUserSticker`, `favoriteUserSticker` and
`unfavoriteUserSticker` look up `UserSticker` by the caller-supplied `id` and act on it
without comparing `userSticker.userId` to `locals.user.id`. Any user can delete or re-favorite
any other user's stickers (and, via H4, the underlying file).

### H6 — Reaction handlers have no chat-membership check, and leak message content

`src/lib/server/socket.ts:727` (`react-to-message`) and `:769` (`update-reaction`).

Both look up a message by ID and update it with no check that the caller is in the chat. The
handler then returns the updated row `include: { user, chat, readBy }` and emits it to the
room — so a non-member who knows a message ID gets back the full ciphertext, sender, chat
metadata and read receipts. Chain with H1 to obtain the IDs.

`mark-messages-read` (`:820`) has the same gap: an outsider can attach themselves to any
message's `readBy` relation and emit a bogus `messages-read` to the room.

### H7 — Unauthenticated file read via `/api/get-encrypted-file-stream` path check bypass

`src/routes/api/get-encrypted-file-stream/+server.ts:29-32`:

```js
if (!fullPath.startsWith(allowedBasePath)) { ... }
```

`startsWith` on a path string is not a containment check — `/uploads-backup/secrets` passes a
`/uploads` prefix test. Compare against `allowedBasePath + path.sep`, or use
`path.relative()` and reject results starting with `..`.

Independently, **the endpoint does no per-chat authorization at all**: any authenticated user
can stream any file under the uploads tree by path, including other chats' attachments. Files
are E2EE so contents stay opaque, but it grants unlimited harvesting of every encrypted
attachment on the server. The odd `filePath.indexOf(':')` stripping at line 21 also silently
mutates input in a way that makes the subsequent validation harder to reason about.

The same `startsWith` bypass exists in `/api/profile-picture/+server.ts:46`, which is in
`PUBLIC_ROUTES` and so is reachable **unauthenticated**.

### H8 — Session cookie is `secure: false` on login

`src/routes/login/data.remote.ts:16` — `secure: false, // Set to true in production with HTTPS`.
The register path (`register/data.remote.ts`) correctly uses
`secure: process.env.NODE_ENV === 'production'`. So every login over HTTP transmits the
session cookie in the clear and it will be sent over any plaintext request to the origin.
Also worth adding `__Host-` prefixing once `secure` is on.

### H9 — No rate limiting on login

`src/routes/login/data.remote.ts`. `validateUser` is unthrottled — unlimited password guesses
against a 6-character minimum password (`validation.ts`). bcrypt cost 12 slows this but does
not stop it, and it doubles as a cheap CPU-exhaustion DoS (each attempt costs the server
~250ms of CPU; a few concurrent attackers saturate the event loop).

Note that `confirmPassword` (`src/lib/utils/password.remote.ts`) *does* implement throttling,
correctly and with a good comment. The same treatment is needed on the actual login path.

### H10 — `getUsers` (admin) returns password hashes and master-key material

`src/routes/admin/admin.remote.ts:7-16` — `db.user.findMany()` with no `select`. The response
includes every user's bcrypt `password` hash and their `encryptedKey` (the master seed blob
used for QR device transfer). This is serialized to the admin's browser and sits in the page
payload / dev tools / any client-side cache.

An admin is trusted, but they should not be handed offline-crackable hashes for every family
member as a side effect of loading a settings page. Use `safeUserFields` plus `isAdmin` and
`createdAt`.

### H11 — `error` imported from `'console'`, silently disabling error handling

`src/routes/settings/sessions/data.remote.ts:4`:

```js
import { error } from 'console';
```

This is `console.error` — it **logs and returns**, it does not throw. Every `error(...)` call
in that file is a no-op guard:

- `getSessions`: the 401 check falls through and then throws a raw `TypeError` on
  `locals.user!.id`; the catch block's `error(500, ...)` also doesn't throw, so the function
  returns `undefined` where callers expect an array.
- `logoutSession`: the 401 checks are dead code (moot in practice — see H2, where the real
  problem is the missing ownership check).

An easy mistake from IDE auto-import, but it means this file's error paths have never worked.

---

# MEDIUM

### M1 — AES-GCM nonce reuse in reaction encryption

`src/lib/crypto/message.ts:60-84`. The IV is derived deterministically:

```js
const seedData = encoder.encode(`${userId}:${reaction}`);
const iv = new Uint8Array((await crypto.subtle.digest('SHA-256', seedData)).slice(0, 12));
```

The IV depends only on user and reaction — not on the message, the chat, or the key version.
GCM's security proof requires nonces to be unique per key; violating it is the single most
common way to break GCM in practice.

Here the colliding plaintexts happen to be *identical*, which spares you the full forbidden
attack (authentication-key recovery and tag forgery) — but that safety is incidental, not
designed, and any future change that makes reaction plaintexts vary per message (adding a
timestamp, a message ID, a count) turns this into full GCM key-commitment failure for the
chat key, which also encrypts every message in that chat.

Even as-is it leaks: identical reactions produce byte-identical ciphertexts, so the server can
link "this user applied the same reaction to messages A, B and C" without any key. Combined
with the `userId:` prefix stored in plaintext in `Message.encryptedReactions`, the server
already knows *who* reacted; determinism tells it *which reactions are the same*.

Fix: random 12-byte IV, as everywhere else in the codebase. Dedup by decrypting client-side
rather than by ciphertext equality.

### M2 — The master key and the HMAC key are the same 32 bytes

`src/lib/crypto/master.ts:16-38`. `getMasterKey()` and `getHmacKey()` both compute
`SHA-256(seed)` and import the identical bytes — once as an AES-GCM key, once as an
HMAC-SHA-256 key. Using one key with two algorithms is a standing violation of key separation;
it is not known to be exploitable for this AES-GCM/HMAC pairing, but it removes a layer of
safety for no benefit.

Use HKDF-Expand from the seed with distinct `info` labels (`"crypthora:aes"`,
`"crypthora:hmac"`). Note this is a **migrating change** — existing HMACs and ciphertexts
would need a versioned seed format, so it is easier to do at 0.1.0 than later.

### M3 — Master seed is stored unprotected in IndexedDB

`src/lib/crypto/master.ts`. The seed is written as plain base64 with no password-derived
wrapping. Consequences:

- Any XSS (C1–C3, C6) is a total compromise, not a session compromise.
- Any process with filesystem access to the browser profile (malware, a shared computer, an
  unencrypted disk, a stolen unlocked laptop) reads it directly.
- A malicious browser extension with storage permission reads it.

The usual mitigation is to wrap the seed with a key derived from the user's password via
Argon2id/PBKDF2 and unwrap it in memory per session. That is a significant UX change
(re-entry on every cold start) and may be a deliberate tradeoff for a family app — but if so
it should be **documented explicitly in the README's security section**, because "E2EE" leads
readers to assume otherwise.

### M4 — Master seed and private key material logged to the console

- `src/lib/crypto/master.ts:55` — `console.log('Importing master seed:', masterSeedBase64)`
- `src/lib/components/KeySharer.svelte:99` — `console.log('In Seed:', base64Seed)`
- `src/lib/crypto/keyPair.ts:44-45, 80-81` — logs the public key **and the encrypted private key**

The seed logs are the serious ones: they put the root secret into the browser console buffer,
where it persists, is visible to anyone shoulder-surfing devtools, and gets captured verbatim
in screen recordings and "here's my console output" bug reports. Strip these before 0.1.0.

254 `console.*` calls across `src/` overall — worth a general pass for a stable release.

### M5 — Server-side logs leak conversation metadata

`src/lib/server/socket.ts` logs usernames, user IDs, chat IDs and per-message events on every
send (`:557`, `:601`, `:606`). For a server whose selling point is that the operator cannot
read messages, writing a full metadata trail of who-messaged-whom-and-when to stdout — where
it lands in Docker's json-file log driver, unrotated by default — undercuts the promise.

### M6 — Message ciphertext is not bound to sender or chat

`src/lib/crypto/message.ts:6`. Encryption uses no AAD. A chat member can copy another
member's `encryptedContent` and re-send it as their own message; the server accepts any blob
and the recipient renders it under the replayer's name. Also allows re-sending an old message
as new.

Fix: pass `additionalData` binding `chatId`, `senderId` and `keyVersion` into the
`encrypt`/`decrypt` calls, and verify on receipt.

### M7 — `typing-start` accepts a client-supplied username

`src/lib/server/socket.ts:847-853`. The relayed `username` comes from the payload rather than
`socket.user.username` (the `userId` is correctly taken from the socket). Lets a member spoof
"X is typing…" for anyone. Small, but note that `request-user-verify` right above it gets this
exactly right, with a comment explaining why — the same reasoning applies here.

### M8 — `getFileSize` is an arbitrary-path file-existence and size oracle

`src/lib/fileUpload/upload.remote.ts:52-68`. Any authenticated user can `fs.stat()` any path
the node process can read. No uploads-root containment. Discloses server filesystem layout and
file sizes.

Also, `fileExists()` is `async` and is called **without `await`** at lines 22 and 60 — the
guard `if (!fileExists(filePath))` tests a Promise object, which is always truthy, so the
404 branch is unreachable. Same bug in `removeFile`.

### M9 — Unbounded `sharp` resize in the public profile-picture endpoint

`src/routes/api/profile-picture/+server.ts:71-77`. `size` is `parseInt`'d with no bounds and
handed to `sharp().resize(size, size)`. `?size=30000` allocates a ~3.6 GB buffer. The route is
in `PUBLIC_ROUTES`, so this is an **unauthenticated memory-exhaustion DoS**. `NaN` (from
`?size=abc`) also reaches sharp. Clamp to a small whitelist (e.g. 48/96/256) and reject
everything else.

Related: there is no `Content-Length`-independent cache bound and results are served
`immutable` for a year, which is wrong if a user changes their avatar and reuses a path.

### M10 — `updateGroupName` / `updateGroupImage` are not owner-restricted, and unbounded

`src/lib/chat/chat.remote.ts`. Both allow *any participant* to rename a group or replace its
image, while `addUserToChat` / `removeUserFromChat` / `rotateChatKey` are correctly
owner-only. Whether that's intended, it's an inconsistency worth a decision. `groupName` has a
`minLength(3)` but **no maximum**, so a member can store an arbitrarily large string and blast
it to every client via `chat-updated`. `displayName` (`profile/data.remote.ts:22`) has no
length validation at all.

### M11 — Upload endpoint returns absolute server filesystem paths

`upload-encrypted-file/+server.ts` and `upload-profile-picture/+server.ts` both respond with
`{ filePath: '/uploads/media/...' }` — the real on-disk path, which the client then stores and
replays. Beyond the information disclosure, making the client the source of truth for server
paths is what enables C4/H4. Return an opaque ID and resolve it server-side.

### M12 — `NTFY_URL` path injection via client-supplied topic

`src/lib/server/pushNotifications.ts:14` — `const url = \`${NTFY_URL}/${topic}\``. `topic`
comes from `subscribe-ntfy-push` and is never validated. `topic = "../admin/whatever"` lets a
user redirect the server's POST to other paths on the ntfy host. Contained to the internal
Docker network in the default deployment, but it's a server-side request the user steers.
Validate against `^[A-Za-z0-9_-]{8,64}$`.

Separately: the default `docker-compose.yaml` runs ntfy with **no auth or ACL**, so anyone who
learns a topic name can subscribe to a user's notification stream (which carries sender
username, chat name and chat ID in plaintext).

### M13 — Upload dir constant is inconsistent, so chat media is never deleted

`src/lib/server/fileUpload.ts:4` resolves the base as `'/uploads'` in production, but
`src/lib/chat/chat.remote.ts` defines its own:

```js
const UPLOAD_BASE_PATH = process.env.UPLOAD_PATH || './uploads';
```

`UPLOAD_PATH` is not set anywhere in `.env.example` or `docker-compose.yaml`, so in production
`deleteChat()` tries to `removeDir('./uploads/media/<id>')` relative to the process CWD (`/app`),
which doesn't exist. `removeDir` swallows the error. **Deleting a chat leaves all its
encrypted attachments on disk indefinitely** — a real problem for a privacy tool, and the
kind of thing a user would reasonably assume works.

### M14 — FCM push leaks conversation metadata to Google

`src/lib/server/fcm.ts:sendFcmNotification` sends `username`, `chatName`, `chatId` and
`timestamp` as an unencrypted FCM data payload. Google therefore sees who is messaging whom,
in which named group, and when, for every notification. This is inherent to FCM and hard to
avoid, but it is a meaningful carve-out from the app's privacy claim and belongs in the README
next to the FCM setup instructions, so operators can choose ntfy knowingly.

---

# LOW / INFORMATIONAL

### L1 — No security headers or CSP
Nothing in `hooks.server.ts` or `server/index.ts` sets `Content-Security-Policy`,
`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` or HSTS. A CSP is the standard
second line of defence behind C1–C3 and would have blunted all of them. SvelteKit supports
`kit.csp` in `svelte.config.js` with nonce/hash generation.

### L2 — 24 npm advisories (9 moderate, 14 high, 1 critical)
Beyond C6, the ones that matter operationally:
- **`@sveltejs/kit` 2.45.0** (fixed in >2.70.3) — several remote-function-specific issues:
  prototype pollution in the remote-form file-input path, big-payload process crash, `query.batch`
  cross-talk, and an unauthenticated `Accept`-header ReDoS. This app uses remote functions
  heavily, so these are directly applicable. Also an `adapter-node` `BODY_SIZE_LIMIT` bypass,
  relevant given the 1 GB limit in compose.
- **`ws` 8.17.1** and `engine.io` — uninitialized memory disclosure and memory-exhaustion DoS,
  reachable through Socket.IO, which is exposed to the internet here.
- **`valibot` 1.1.0** — `record()` issue paths make `flatten()` throw on inherited `Object`
  property names. `hooks.server.ts:handleValidationError` and `collectErrorMessages` both use
  flatten, and `v.record(v.string(), v.string())` is used for `encryptedUserChatKeys` — so a
  key of `__proto__` or `constructor` is a plausible crash vector.
- **`sharp` 0.34.4** — libvips CVEs, reachable via the unauthenticated profile-picture route.
- `protobufjs` and `tar` are critical but transitive/build-time; lower priority.

`npm audit fix` covers most; kit and pdfjs deserve deliberate upgrades with a smoke test.

### L3 — `tsx` is a devDependency but is the production entrypoint
`package.json`: `"start": "npx tsx server/index.ts"` with `tsx` under `devDependencies`, while
the Dockerfile runs `npm ci --only=production`. So `npx` fetches `tsx` **from the network at
container start**, every start. That's a startup dependency on npm being reachable, a
silent-supply-chain surface (whatever `tsx@latest` resolves to that day), and a slow boot.
Either move `tsx` to `dependencies` or precompile `server/index.ts` in the build stage.

### L4 — First-user-becomes-admin has an open window
`src/lib/utils/auth.ts:22` grants admin to the first registered user, and
`register/data.remote.ts` allows unrestricted registration while `userCount === 0`. Between
`docker compose up` and the operator registering, anyone who finds the instance can claim
admin. `db.user.count()` is also read outside a transaction, so two simultaneous registrations
on a fresh instance can both become admin. Consider a one-time setup token, or an
`ADMIN_USERNAME` env var.

### L5 — Weak password policy for a key-bearing account
6-character minimum, no complexity or breach check (`utils/validation.ts`). Given H9 (no login
throttling) this is thin. If M3 is ever addressed by deriving key material from the password,
6 characters becomes actively dangerous.

### L6 — Session lifetime and cookie lifetime disagree
Session rows expire in 6 months (`auth.ts:41`) and auto-renew when within 15 days of expiry;
the cookie is set with `maxAge: 60*60*24*360` (~11.8 months) and is **not** refreshed on
renewal. So the cookie can outlive its DB row, or vice versa. Set both from one constant and
re-set the cookie whenever the session renews.

### L7 — No session cleanup job
Expired sessions are only deleted when someone happens to present them
(`validateSession`). Abandoned sessions accumulate forever. Same for
`NotificationSubscription` rows whose session is gone.

### L8 — Unbounded in-memory caches
- `chat.remote.ts:17` `userCache` — entries are added on every `getUserById` and **never
  evicted**, only TTL-checked on read. Grows with the number of distinct users ever looked up.
  Also means a display-name or avatar change takes up to 5 minutes to appear, with no
  invalidation on `updateDisplayName` / `updateProfilePicture`.
- `password.remote.ts` `failedAttempts` and `socket.ts` `peersCache` — same pattern, both
  small in practice.
- All three are per-process, so they behave differently if the app is ever scaled to more than
  one instance. Worth a comment even if you never scale.

### L9 — `admin.deleteUser` is known-broken
`admin.remote.ts:18-27` — the comment concedes it fails on foreign-key constraints. A user
whose only account-management action is "delete a user" and it throws a 500 is a rough edge
for a 0.1.0. Either implement the cascade (messages, participations, keys, sessions,
subscriptions, uploaded files) or hide the button.

### L10 — `removeUserFromChat` lets the owner remove themselves
`chatOwner.remote.ts` checks `chat.ownerId === locals.user.id` but never rejects
`userId === ownerId`, leaving a chat whose owner is not a participant — no one can then add
members or rotate keys. `leaveChat` handles owner-departure correctly (transfers ownership);
this path doesn't.

### L11 — `send-message` doesn't validate `replyToId`
`socket.ts:540`. `replyToId` isn't checked to belong to the same chat, so a reply can point at
a message in a different chat (rendering as an undecryptable stub at best). Cheap to add
alongside the existing membership check.

### L12 — Repo hygiene
- **`CLAUDE.md` describes a codebase that doesn't exist**: it references
  `src/routes/[lang=lang]/(main)`, `src/routes/[lang=lang]/articles` and `src/sitemap.config.js`,
  none of which are present. It also says to use `$t('...')`/`tKey('...')` — `src/lib/t-key.ts`
  does exist, so that part holds. Worth fixing before contributors act on it.
- **No tests.** No test runner, no test files, no CI test step — CI only builds the Docker
  image and cuts release notes. For a crypto-carrying app going to 0.1.0, at minimum the
  encrypt/decrypt round-trips, the key-version selection logic, and the authorization guards
  deserve coverage; the auth guards especially, since this review found so many missing.
- `src/generated/prisma` is gitignored but a stale `libquery_engine-darwin-arm64.dylib.node`
  and friends are on disk — confirm they aren't in the Docker build context (`.dockerignore`
  does not exist, so `COPY . .` in the builder stage ships them).
- `.DS_Store` files are committed at repo root and in `src/`, `src/lib/`.
- `docker-compose.yaml` publishes no ports for `crypthora-chat`, which will confuse anyone
  self-hosting without reading `INSTALLATION.md` closely.
- `PROFILE_PIC_KEY` is read as `process.env.PROFILE_PIC_KEY!` with no startup validation
  (`api/profile-picture/+server.ts:12`); if unset or malformed the failure surfaces as a
  confusing 404 on first avatar load rather than a clear boot error. Validate required env
  vars at startup.

---

## Suggested order of work

**Blockers for 0.1.0**

1. C1/C2/C3 — replace hand-rolled HTML assembly in `textTools.ts`. Escape `"` and `'`, or
   better, build the DOM as nodes / sanitize the output. This is one file and fixes three
   criticals.
2. C6 + L2 — upgrade `pdfjs-dist` (≥6.2.108, plus `isEvalSupported: false`), `@sveltejs/kit`,
   `ws`/socket.io, `valibot`, `sharp`.
3. C4/C5/H4/H7/M8/M11 — one shared, audited helper: resolve a client path, assert containment
   under the uploads root with `path.relative`, reject otherwise. Route *every* file read,
   write, `mkdir` and `unlink` through it. Stop returning absolute paths to clients.
4. H1/H6 — add a `assertParticipant(socket.user.id, chatId)` check to `join-chat`, the
   reaction handlers and `mark-messages-read`. `send-message` already shows the pattern.
5. H2/H5 — add the missing `userId` ownership checks (two-line fixes each).
6. H3 — switch session IDs to `crypto.randomBytes`.
7. H8/H9 — `secure: true` in production, throttle login.

**Strongly recommended before dropping "alpha"**

8. H10, H11, M1, M4, M13, L1 (CSP).
9. Write down the threat model in the README: what the server operator can see (metadata,
   system messages, reaction linkability, presence), what FCM/ntfy see, and that the master
   seed is stored unwrapped on the device (M3). Being explicit here is more valuable than any
   single fix, because it lets self-hosters make an informed choice.

**Follow-up**

10. The remaining mediums and lows, plus a test suite covering the authorization guards — this
    review found enough missing checks that regressions are likely without one.
