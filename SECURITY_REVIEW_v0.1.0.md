# Security Review - CrypthoraChat v0.1.0

**Date:** August 18, 2026  
**Status:** Pre-release audit (no fixes applied yet)  
**Scope:** Full codebase review for v0.1.0 release

---

## Summary

This document catalogs security vulnerabilities and concerns identified during a comprehensive security review of the CrypthoraChat codebase. The review focused on high-confidence, exploitable vulnerabilities with real security impact.

### Severity Breakdown
- **HIGH:** 3 findings
- **MEDIUM:** 4 findings
- **LOW:** 0 findings

**Total Findings:** 7

---

## HIGH Severity Findings

### 1. Insecure Cookie Configuration in Login Handler

**File:** `src/routes/login/data.remote.ts:20`

**Severity:** HIGH  
**Category:** Authentication & Session Management  
**Confidence:** 9/10

**Description:**  
The login handler sets the session cookie with `secure: false` unconditionally, even in production environments. This allows session cookies to be transmitted over unencrypted HTTP connections, where they can be intercepted by network attackers (man-in-the-middle attacks).

**Code:**
```typescript
cookies.set('session', session.id, {
  path: '/',
  httpOnly: true,
  secure: false, // Set to true in production with HTTPS
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 360
});
```

**Exploit Scenario:**  
An attacker on the same network (or through a compromised ISP/WiFi) can intercept HTTP requests containing the session cookie. By capturing the session ID, the attacker can impersonate the victim and gain full access to their encrypted chats, contacts, and account settings without knowing their password.

**Recommendation:**  
Set `secure: true` in production. The correct pattern is already shown in the registration handler:
```typescript
secure: process.env.NODE_ENV === 'production'
```
Apply this same logic to the login handler for consistency and security.

---

### 2. Path Traversal Vulnerability in Profile Picture Download

**File:** `src/routes/api/profile-picture/+server.ts:47-50`

**Severity:** HIGH  
**Category:** Path Traversal / Information Disclosure  
**Confidence:** 9/10

**Description:**  
The profile picture endpoint uses `path.resolve()` on an untrusted `filePath` query parameter, then checks if it starts with the upload directory. However, the path validation occurs AFTER resolving the path, and the resolved path can still escape the intended directory via symlinks or other path manipulation techniques. More critically, there's no normalization of the input before the initial check.

**Code:**
```typescript
const absPath = path.resolve(filePathParam);
if (!absPath.startsWith(path.resolve(UPLOAD_PATH))) {
  throw error(400, 'Invalid filePath');
}
```

**Exploit Scenario:**  
An attacker can craft a malicious `filePath` parameter like `/uploads/profiles/../../../etc/passwd` or use symlinks if they can write to the upload directory. Although `path.resolve()` normalizes `.., `.`, the path traversal check happens on resolved paths, but symlink attacks are still possible. More directly, if an attacker can predict or influence the upload path (via chatId in media uploads), they could read arbitrary files on the system.

**Attack Path:**  
1. Attacker discovers they can upload files via `/api/upload-encrypted-file` with a controlled `chatId`
2. Files are stored in predictable paths like `/media/{chatId}/`
3. Attacker uploads a symlink (if possible) or uses path traversal in subsequent requests
4. Attacker reads sensitive files outside the upload directory

**Recommendation:**  
1. Use a whitelist of allowed files rather than path-based validation
2. Store uploaded files with random, non-predictable names only
3. Use `path.relative()` to verify the file is within the upload dir before accessing:
```typescript
const absPath = path.resolve(filePathParam);
const allowedBasePath = path.resolve(UPLOAD_PATH);
const relativePath = path.relative(allowedBasePath, absPath);
if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
  throw error(403, 'Access denied');
}
```
4. Never follow symlinks when reading files

---

### 3. Path Traversal in Encrypted File Download

**File:** `src/routes/api/get-encrypted-file-stream/+server.ts:15-30`

**Severity:** HIGH  
**Category:** Path Traversal / Information Disclosure  
**Confidence:** 9/10

**Description:**  
The encrypted file stream endpoint has a path traversal vulnerability. While it does attempt to validate the path, the validation logic has a bypass: it strips paths after the first `:` character (line 20-22), which appears intended for Windows drive letters, but this can be exploited. The path normalization and validation are also insufficient against certain path traversal patterns.

**Code:**
```typescript
let filePath = url.searchParams.get('filePath');
if (!filePath) {
  return errorResponse(400, 'Missing filePath parameter');
}

if (filePath.indexOf(':') !== -1) {
  filePath = filePath.substring(filePath.indexOf(':') + 1);
}

const normalizedPath = path.normalize(filePath);
const fullPath = path.resolve(normalizedPath);
const allowedBasePath = path.resolve(UPLOAD_BASE_PATH);

if (!fullPath.startsWith(allowedBasePath)) {
  return errorResponse(403, 'Access denied: Invalid file path');
}
```

**Exploit Scenario:**  
An attacker can craft a path like `C:/../../etc/passwd` (on Windows with the `:` stripping) or use more complex Unicode/encoding tricks combined with `path.normalize()` to bypass the check. The real issue is using `fullPath.startsWith()` which is vulnerable to directory names that are prefixes of the allowed path (e.g., if `UPLOAD_BASE_PATH = /uploads`, an attacker could access `/uploadsecret/file`).

**Recommended Fix:**
```typescript
const relativePath = path.relative(allowedBasePath, fullPath);
if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
  return errorResponse(403, 'Access denied: Invalid file path');
}
```

---

## MEDIUM Severity Findings

### 4. Session Cookie Expiration Too Long

**File:** `src/routes/register/data.remote.ts:33` and `src/routes/login/data.remote.ts:22`

**Severity:** MEDIUM  
**Category:** Session Management / Exposure Window  
**Confidence:** 8/10

**Description:**  
Session cookies are set with a `maxAge` of 360 days (`60 * 60 * 24 * 360`). This is an extremely long session lifetime, dramatically increasing the window of opportunity for session hijacking or use of a compromised session ID.

**Code:**
```typescript
maxAge: 60 * 60 * 24 * 360  // 360 days
```

**Exploit Scenario:**  
1. Attacker steals a session cookie through network interception (if `secure: false` bug exists)
2. Session is valid for a full year
3. Attacker can use the stolen session indefinitely for 360 days
4. For E2EE chat apps, this is especially critical as the user may not notice an old session being used

**Recommendation:**  
Reduce session lifetime to a reasonable duration (e.g., 30 days or less). Session refresh logic already exists in `validateSession()` which extends expiry if within 15 days of expiration. Consider:
- Reducing from 360 days to 30 days
- Requiring re-authentication for sensitive operations (password change, key rotation)
- Implementing session activity tracking and timeout

---

### 5. Missing CSRF Protection

**File:** Global issue across all state-changing endpoints

**Severity:** MEDIUM  
**Category:** CSRF / Authorization  
**Confidence:** 8/10

**Description:**  
The application does not implement CSRF (Cross-Site Request Forgery) protection on form actions and API endpoints. SvelteKit provides built-in CSRF protection via the `csrfProtection` option, but it must be explicitly enabled. Without it, attackers can forge requests from other sites.

**Affected Areas:**
- `src/routes/login/data.remote.ts` - login form
- `src/routes/register/data.remote.ts` - registration form
- File upload endpoints
- All remote function endpoints (`.remote.ts` files)

**Exploit Scenario:**  
1. Attacker hosts a malicious webpage with hidden forms
2. They trick a logged-in user into visiting their site
3. A hidden form auto-submits a request to start a chat, upload a file, or change settings
4. The browser automatically includes the user's valid session cookie
5. The action is performed on behalf of the user without their knowledge

**Recommendation:**  
1. Enable SvelteKit's CSRF protection in `svelte.config.js`:
```javascript
csrf: {
  checkOrigin: true,
  protection: true
}
```
2. Verify CSRF tokens are properly validated on all state-changing operations
3. Ensure SameSite cookie attribute is set to `strict` (currently `lax`)

---

### 6. Weak Password Validation Rules

**File:** `src/lib/utils/validation.ts:10-15`

**Severity:** MEDIUM  
**Category:** Authentication / Weak Credential Policy  
**Confidence:** 8/10

**Description:**  
Password validation only checks:
- Minimum length: 6 characters
- Maximum length: 128 characters
- No character composition requirements (no uppercase, digits, special chars enforced)

Six characters is far below modern security standards for passwords, especially for an E2EE application handling sensitive communications.

**Code:**
```typescript
password: v.pipe(
  v.string('login.validation.password.required'),
  v.minLength(6, 'login.validation.password.too-short'),
  v.maxLength(128, 'login.validation.password.too-long')
)
```

**Exploit Scenario:**  
- Attacker uses a dictionary attack or brute-force against accounts with weak passwords like `123456` or `password`
- With only 6 characters of keyspace, password cracking is feasible even against bcrypt (12 rounds)
- Users may choose weak passwords, and the system does not enforce complexity

**Recommendation:**  
1. Increase minimum password length to at least 12 characters
2. Consider adding optional guidance for strong passwords (but avoid overly restrictive requirements)
3. Add server-side rate limiting on login attempts (currently missing)
4. Consider implementing breach database checking (e.g., Have I Been Pwned API)

---

### 7. No Rate Limiting on Authentication Endpoints

**File:** `src/routes/login/data.remote.ts` and `src/routes/register/data.remote.ts`

**Severity:** MEDIUM  
**Category:** Brute Force / DOS  
**Confidence:** 8/10

**Description:**  
Login and registration endpoints have no rate limiting, allowing unlimited authentication attempts. An attacker can brute-force passwords or perform account enumeration attacks.

**Exploit Scenario:**  
1. Attacker targets login endpoint
2. No rate limiting allows 1000s of requests per second
3. Combined with weak 6-character passwords, many accounts are compromised
4. For registration, attacker can enumerate all valid usernames by attempting to register them repeatedly

**Recommendation:**  
1. Implement rate limiting per IP/username:
   - Max 5 login attempts per minute per username
   - Max 3 registration attempts per minute per IP
   - Progressive backoff after repeated failures
2. Implement account lockout after N failed attempts (10-15 minutes)
3. Consider implementing CAPTCHA for repeated failures
4. Log failed authentication attempts for monitoring

**Implementation Suggestion:**  
Use a rate limiting middleware or library like `express-rate-limit` or implement with Redis/in-memory store.

---

### 8. Missing Input Validation on File Extension

**File:** `src/routes/api/upload-profile-picture/+server.ts:107-109`

**Severity:** MEDIUM  
**Category:** File Upload / Type Validation  
**Confidence:** 7/10

**Description:**  
The profile picture upload accepts any file extension provided by the client without validation. While the file is encrypted server-side, a malicious actor could:
1. Upload an executable file with a misleading extension
2. Cause problems during file serving if MIME type detection is bypassed
3. Fill disk space with large files using `.exe` or other extensions

**Code:**
```typescript
bb.on('field', (name: string, value: string) => {
  if (name === 'fileExtension') {
    fileExtension = value || 'png';  // User-controlled!
  }
});
```

Later used in:
```typescript
const finalFilename = `${randomUUID()}.${fileExtension}.enc`;
```

**Recommendation:**  
1. Whitelist allowed extensions (png, jpg, jpeg, webp, gif only)
2. Validate file content (magic bytes) to match the extension
3. Use `sharp` library's format detection instead of trusting client-provided extensions

---

## FINDINGS SUMMARY TABLE

| # | File | Line | Severity | Category | Title |
|---|------|------|----------|----------|-------|
| 1 | `src/routes/login/data.remote.ts` | 20 | HIGH | Auth/Session | Insecure Cookie Configuration |
| 2 | `src/routes/api/profile-picture/+server.ts` | 47-50 | HIGH | Path Traversal | Path Traversal in Profile Picture |
| 3 | `src/routes/api/get-encrypted-file-stream/+server.ts` | 15-30 | HIGH | Path Traversal | Path Traversal in File Download |
| 4 | `src/routes/login/data.remote.ts` | 22 | MEDIUM | Session Mgmt | Session Expiration Too Long |
| 5 | Multiple Endpoints | - | MEDIUM | CSRF | Missing CSRF Protection |
| 6 | `src/lib/utils/validation.ts` | 10-15 | MEDIUM | Auth Policy | Weak Password Validation |
| 7 | Multiple Endpoints | - | MEDIUM | Brute Force | No Rate Limiting |
| 8 | `src/routes/api/upload-profile-picture/+server.ts` | 107-109 | MEDIUM | File Upload | File Extension Not Validated |

---

## Additional Notes

### Positive Security Observations
1. ✅ Passwords are properly hashed with bcrypt (12 rounds)
2. ✅ E2EE architecture with client-side encryption is sound
3. ✅ Session validation checks expiration properly
4. ✅ HTTP-only cookies are used (when secure flag is fixed)
5. ✅ File uploads are stream-based, not fully buffered
6. ✅ Prisma ORM prevents SQL injection

### Not Included (Out of Scope)
- Dependency version vulnerabilities (managed separately)
- DOS via resource exhaustion
- Theoretical timing attacks
- Missing audit logging
- Infrastructure/deployment configuration

---

## Recommended Action Items

### Immediate (Critical for v0.1.0)
1. Fix insecure cookie flag in login handler
2. Fix path traversal vulnerabilities in file endpoints
3. Add file extension validation

### Before Production
1. Enable CSRF protection
2. Implement rate limiting on auth endpoints
3. Increase minimum password length
4. Reduce session timeout

### Post-Release
1. Implement security monitoring/logging
2. Regular dependency updates
3. Consider security audit by third party

