# Authxn — Tyla (Client) → Tyto (Backend) → Google SSO

> **Status:** Design draft
> **Date:** 2026-05-10
> **Scope:** Authentication & authorization for `tyla login init`. Defines the OAuth 2.0 + PKCE flow between the Tyla CLI and Google, the API contract between Tyla and Tyto, and the concrete changes required on the Tyto backend.
> **Companion doc:** [2026-04-30-ai-tutor-login-init-design.md](2026-04-30-ai-tutor-login-init-design.md) — higher-level architecture sketch and policy/logging design.

---

## 1. Goals & Non-Goals

### Goals
- Single sign-on for Tyla CLI users via Google.
- Tyto remains the sole authority on **who is allowed in** (whitelist) and **what tokens look like** (credential issuance).
- The CLI never sees Google client secrets and never persists Google tokens; only the Tyto-issued credential is stored locally.
- Login is **idempotent and re-runnable**: `tyla login init` can be re-executed at any time to refresh the credential.
- **No new auth infrastructure on the backend** — the CLI reuses the existing `verify_google_token` endpoint.

### Non-Goals (this iteration)
- Course / assignment context delivery is **out of scope of the login response itself**. A separate stage-2 API fetches that after login (see §6).
- Encrypted assignment-file download is **stage 2**, not part of login.
- Web frontend SSO (already working with `accessToken`) is **untouched**. This document only covers the CLI path.
- Refresh tokens / silent re-auth are deferred — when the credential expires, the user re-runs `tyla login init`.

---

## 2. Architecture Overview

```
┌─────────────────────────┐         ┌──────────────────────┐         ┌────────────────────┐
│       Tyla CLI          │         │     Tyto Backend     │         │      Google        │
│  (Node / TypeScript)    │         │       (Roda)         │         │   (OAuth + APIs)   │
└─────────────────────────┘         └──────────────────────┘         └────────────────────┘
        │                                     │                                  │
        │ 1. PKCE pair, open browser          │                                  │
        ├────────────────────────────────────────────────────────────────────────►│
        │                                                                        │
        │ 2. authorization_code (via localhost callback)                         │
        │◄───────────────────────────────────────────────────────────────────────┤
        │                                                                        │
        │ 3. exchange code+verifier → access_token                               │
        ├────────────────────────────────────────────────────────────────────────►│
        │◄───────────────────────────────────────────────────────────────────────┤
        │                                                                        │
        │ 4. POST /api/auth/verify_google_token { accessToken }                  │
        ├─────────────────────────────────────►│                                 │
        │                                      │ 5. GET userinfo (access_token)  │
        │                                      ├────────────────────────────────►│
        │                                      │◄────────────────────────────────┤
        │                                      │                                 │
        │                                      │ 6. whitelist check (DB lookup)  │
        │                                      │ 7. issue Tyto credential        │
        │ 8. { credential, account }           │                                 │
        │◄─────────────────────────────────────┤                                 │
        │                                                                        │
        │ 9. persist ~/.tyla/auth.json                                           │
        │                                                                        │
        │ 10. (stage 2) GET /api/account/current_context (Bearer)                │
        ├─────────────────────────────────────►│                                 │
        │ 11. { course, assignment }           │                                 │
        │◄─────────────────────────────────────┤                                 │
        │                                                                        │
        │ 12. write .ai-tutor-config (cwd)                                       │
```

### Separation of concerns

| Layer | Responsibility |
|-------|----------------|
| **Tyla CLI** | OAuth client mechanics only — PKCE pair, loopback callback server, code exchange, secure local storage of Tyto credential. **Does not** know who is whitelisted, **does not** store Google tokens beyond the exchange. |
| **Tyto Backend** | Single source of truth for authorization. Uses the existing `verify_google_token` pipeline (calls Google userinfo with `access_token`, checks whitelist, issues its own opaque credential). Both web frontend and CLI hit the same endpoint. |
| **Google** | Identity provider only. Asserts "this is the user who consented", nothing more. |

---

## 3. Tyla CLI Flow (OAuth 2.0 + PKCE)

The CLI is a **public client** (cannot keep a client secret), so PKCE is mandatory.

### 3.1 Pre-login: prepare PKCE
- Generate `code_verifier`: random URL-safe string, 43–128 chars (RFC 7636 §4.1).
- `code_challenge = BASE64URL(SHA256(code_verifier))`.
- Start an HTTP server on `http://127.0.0.1` with **port `0`** — the OS assigns a free port automatically (`server.listen(0, '127.0.0.1')`). Read the actual port back from `server.address().port` after binding, then compose `redirect_uri` dynamically. This avoids any hard-coded port collision.
- Generate `state` (random 32 bytes, base64url) — verified on callback to prevent CSRF.

### 3.2 Open consent screen
Build the authorization URL:

```
https://accounts.google.com/o/oauth2/v2/auth
  ?client_id=<TYLA_GOOGLE_CLIENT_ID>
  &redirect_uri=http://127.0.0.1:<PORT>/callback
  &response_type=code
  &scope=openid%20email%20profile
  &code_challenge=<code_challenge>
  &code_challenge_method=S256
  &state=<state>
  &prompt=select_account         # always ask which Google account to use
```

Before opening the browser, **always print the URL to the terminal first** so the user can copy-paste it as a fallback:

```
Opening your browser to log in to Google...
If the browser does not open automatically, please click or copy/paste this link:
https://accounts.google.com/o/oauth2/v2/auth?...
```

Then attempt to open the browser (`open` on macOS, `xdg-open` on Linux, `start` on Windows; use the [`open`](https://www.npmjs.com/package/open) npm package). If `open()` throws, swallow the error — the printed URL is already the fallback.

### 3.3 Receive authorization code
- Google redirects the browser to `http://127.0.0.1:<PORT>/callback?code=<CODE>&state=<state>`.
- The local HTTP server captures the request.
- Verify `state` matches what we sent (reject otherwise — possible CSRF).
- Reply to the browser with a small HTML page: *"Login complete — you can close this tab."*
- Shut down the local HTTP server.

### 3.4 Exchange code for tokens
`POST https://oauth2.googleapis.com/token`

Body (form-urlencoded):
```
grant_type=authorization_code
code=<CODE>
redirect_uri=http://127.0.0.1:<PORT>/callback
client_id=<TYLA_GOOGLE_CLIENT_ID>
code_verifier=<code_verifier>
```

> **Note on `client_secret`:** Google's "Desktop app" OAuth client type issues a `client_secret`, but it is treated as non-secret (it ships with the binary). For PKCE-protected flows the secret is functionally a public identifier. We will include it in the exchange request because Google's token endpoint historically rejects desktop-client requests without it; PKCE remains the actual security boundary.

Response (we use `access_token`):
```json
{
  "access_token": "ya29...",
  "expires_in": 3599,
  "id_token": "eyJhbGciOi...",
  "scope": "openid email profile",
  "token_type": "Bearer"
}
```

The CLI takes `access_token` and forwards it to Tyto. The `id_token` and any refresh token are **discarded immediately**.

### 3.5 Hand off to Tyto
`POST <TYTO_API_HOST>/api/auth/verify_google_token`

```json
{ "accessToken": "ya29..." }
```

This is the **existing endpoint** — no backend changes needed for the auth step.

Expected response (200):
```json
{
  "success": true,
  "message": "Login successful",
  "user_info": {
    "id": 123,
    "name": "Ming-Chun Lee",
    "email": "student@edu.tw",
    "avatar": "https://lh3.googleusercontent.com/...",
    "credential": "<base64url-encrypted-payload>",
    "roles": ["student"]
  }
}
```

403 / 404 / 401 handling: see §5.

### 3.6 Persist credential
Write `~/.tyla/auth.json` (mode `0600` on POSIX, ACL-restricted on Windows):

```json
{
  "credential": "<base64url-encrypted-payload>",
  "account": {
    "id": 123,
    "email": "student@edu.tw",
    "name": "Ming-Chun Lee",
    "avatar": "https://...",
    "roles": ["student"]
  },
  "issuedAt": "2026-05-10T08:14:00Z"
}
```

### 3.7 Local credential expiry check

Before making **any** stage-2 or subsequent authenticated request, the CLI checks locally whether the credential is still valid. Because the Tyto credential is opaque (not a standards JWT), `auth.json` stores an explicit `expiresAt` field set at write time:

```json
{
  "credential": "...",
  "account": { ... },
  "issuedAt":  "2026-05-10T08:14:00Z",
  "expiresAt": "2026-05-17T08:14:00Z"
}
```

The expiry duration is determined by the CLI at the time of writing (e.g. 7 days, or whatever Tyto communicates in a future `expires_in` field). On every command that needs a credential:

```
if now >= expiresAt:
  print "Your session has expired. Please run: tyla login init"
  exit 1
```

This avoids an unnecessary network round-trip and gives the user a clear, actionable message instead of a raw 401.

If Tyto later **does** return 401 unexpectedly (e.g. server-side key rotation), the CLI treats it as "credential revoked" and prompts the same message.

### 3.8 Stage 2: pull course / assignment context
Once `~/.tyla/auth.json` exists, call:

`GET <TYTO_API_HOST>/api/account/current_context`
Header: `Authorization: Bearer <credential>`

Response:
```json
{
  "selectedCourse":     { "id": "CSDS", "name": "Computer Science Data Structures" },
  "currentAssignment":  {
    "id": "HW2",
    "title": "Homework 2",
    "dueAt": "2026-05-07T23:59:00+08:00",
    "mode": "tutor-guide",
    "starterFile": "student-files/Hw2.Rmd",
    "specFile":    "assignment/HW 02.docx.pdf",
    "submissionEndpoint": "https://api.example.com/submit"
  }
}
```

Then write `<cwd>/.ai-tutor-config` and (later iteration) decrypt the starter file into `<cwd>/assignment/<courseId>-<assignmentId>/`.

---

## 4. Tyto Backend — What Needs to Change

**Auth step: nothing.** The existing `POST /api/auth/verify_google_token` endpoint handles `access_token` → userinfo → whitelist → credential. The CLI plugs straight in.

The only backend addition is the stage-2 context endpoint.

### 4.1 Existing endpoint — no change

| Endpoint | Caller | Input | Status |
|----------|--------|-------|--------|
| `POST /api/auth/verify_google_token` | Web frontend **and CLI** | `{ accessToken }` | **Keep — no change** |

### 4.2 New endpoint: `GET /api/account/current_context`

Bearer-protected. Uses existing `AuthToken::Mapper#from_auth_header` to resolve `account_id`. Service: `Service::Account::FetchCurrentContext.new.call(account_id:)`.

Logic:
- `account_id` from credential.
- Look up the student's enrolled course (one active course per account in this iteration).
- Look up the current assignment for that course (open / not yet past final-late deadline).

Touches **only existing tables** (`accounts`, `courses`, `assignments`, enrollments). No schema migration required.

### 4.3 Configuration additions
`config/secrets_example.yml` (and prod secrets):

```yaml
TYLA_GOOGLE_CLIENT_ID: '<desktop-app-client-id>.apps.googleusercontent.com'
# Web client_id stays as-is for the existing endpoint.
```

The CLI client must be a **separate Google Cloud OAuth client** of type **"Desktop App"** (not "Web Application"), so `redirect_uri=http://127.0.0.1:*` is allowed without pre-registration.

> `TYLA_GOOGLE_CLIENT_ID` is informational for now — the existing `verify_google_token` does not check `aud`. Add it to secrets so we have it ready if we later want to scope the endpoint.

### 4.4 Whitelist behavior — unchanged
The current implementation **already enforces a whitelist** by virtue of `find_account_by_email_with_roles` returning `nil` → 404. We keep this: 404 is the "you are not enrolled" signal. The CLI surfaces this as a clear user-facing message (see §5).

### 4.5 Credential format — unchanged
We **keep the current encrypted-payload credential** (`Tyto::AuthToken::Gateway` + `Tyto::Security::Secret`). It already:
- Carries `{ account_id, roles }`
- Is signed/encrypted with a server-side key (`JWT_KEY` in secrets)
- Is parsed via `AuthToken::Mapper#from_auth_header`

> **Note on naming:** The credential is sometimes called "JWT" in informal docs. It is **not** a JWS-format JWT — it is an encrypted Base64-urlsafe blob. We keep calling it "credential" in code.

---

## 5. API Contract

### 5.1 `POST /api/auth/verify_google_token` (existing — no change)

Request:
```json
{ "accessToken": "ya29..." }
```

| Status | Shape | When |
|--------|-------|------|
| 200 | `{ success: true, message: 'Login successful', user_info: {...} }` (see §3.5) | All checks passed |
| 400 | `{ error: '...' }` | Malformed input |
| 401 | `{ error: '...' }` | Google rejected the token |
| 404 | `{ error: 'Account Not Found' }` | Email verified but not whitelisted |
| 500 | `{ error: 'Internal Server Error', details: '...' }` | Anything else |

### 5.2 `GET /api/account/current_context` (new)

Headers: `Authorization: Bearer <credential>`

| Status | Shape | When |
|--------|-------|------|
| 200 | `{ selectedCourse: {...}, currentAssignment: {...} }` (see §3.7) | Active assignment found |
| 200 | `{ selectedCourse: {...}, currentAssignment: null }` | Enrolled but no active assignment |
| 401 | `{ error: 'Invalid or missing credential' }` | Bad / expired token |
| 404 | `{ error: 'No enrolled course' }` | Account exists but no enrollment |

---

## 6. Tyla CLI — Module Layout (preview, not implemented in this turn)

Following Clean Architecture conventions in [tyla/CLAUDE.md](../tyla/CLAUDE.md):

```
tyla/src/
├── application/
│   └── use-cases/
│       └── execute-login-init-use-case.ts      # orchestrates §3.1–§3.7
├── infrastructure/
│   ├── auth/
│   │   ├── pkce.ts                             # generateVerifier/Challenge
│   │   ├── google-oauth-client.ts              # build URL, exchange code → access_token
│   │   ├── loopback-server.ts                  # ephemeral http server
│   │   └── credential-store.ts                 # ~/.tyla/auth.json read/write/permissions
│   └── api/
│       └── tyto-auth-gateway.ts                # HTTP client for /api/auth/* + /api/account/current_context
└── cli/
    └── presentation/
        └── login-cli-presenter.ts              # `tyla login init` subcommand
```

Storage paths:

| Path | Scope | Contents |
|------|-------|----------|
| `~/.tyla/auth.json`       | Global (per OS user) | Tyto credential + minimal account info |
| `<cwd>/.tyla/`            | Per project          | Sessions, knowledge, settings (existing) |
| `<cwd>/.ai-tutor-config`  | Per project          | Stage-2 result: course + assignment metadata |

CLI command:
```bash
tyla login init                         # full flow: OAuth → verify → stage 2
tyla login init --no-context            # OAuth + verify only, skip stage 2
tyla login status                       # print current credential expiry / account
tyla logout                             # delete ~/.tyla/auth.json
```

---

## 7. Security Considerations

| Concern | Mitigation |
|---------|------------|
| **Code interception** (other local app catching the redirect) | PKCE — without `code_verifier`, a stolen code is useless. |
| **CSRF** on the callback | `state` parameter, verified on receipt. |
| **Browser tab left open** showing the code in URL | `code` is one-time use and short-lived; PKCE binding makes URL leakage low-impact. |
| **Local credential theft** | `~/.tyla/auth.json` written with `0600` (POSIX) / restricted ACL (Windows). Disk-level compromise is out of scope. |
| **Token replay against Tyto** | Tyto credential is encrypted with server-side key and includes account_id; rotating `JWT_KEY` invalidates all credentials. |
| **Refresh tokens stored on disk** | We do **not** request `access_type=offline` in v1. Re-login is the refresh strategy. |

---

## 8. Implementation Checklist

### Tyto (backend)
- [ ] Register a new Google Cloud OAuth client (type: **Desktop App**) → `TYLA_GOOGLE_CLIENT_ID`
- [ ] Add `TYLA_GOOGLE_CLIENT_ID` to `config/secrets_example.yml` and production secrets
- [ ] Add route `GET /api/account/current_context` in `routes/account.rb`
- [ ] Create `Service::Account::FetchCurrentContext`
- [ ] Spec coverage: `current_context` route (200 / 200 null / 401 / 404)
- [ ] Regression: existing `verify_google_token` specs still pass

### Tyla (CLI) — *not in scope for this turn; tracked here for completeness*
- [ ] `infrastructure/auth/pkce.ts`
- [ ] `infrastructure/auth/loopback-server.ts`
- [ ] `infrastructure/auth/google-oauth-client.ts` — exchange code, take `access_token`
- [ ] `infrastructure/auth/credential-store.ts`
- [ ] `infrastructure/api/tyto-auth-gateway.ts`
- [ ] `application/use-cases/execute-login-init-use-case.ts`
- [ ] `cli/presentation/login-cli-presenter.ts` + register `tyla login init` / `status` / `logout`
- [ ] Wire `Authorization: Bearer` injection into existing gateways (per companion doc §2)
- [ ] Tests: PKCE generator, credential-store round-trip, gateway error mapping, use-case orchestration (with mocked HTTP)

---

## 9. Open Items / Out of Scope

| # | Item | Status |
|---|------|--------|
| 1 | Encrypted starter-file download (stage-3) | Out of scope of this doc — separate design |
| 2 | Refresh tokens / silent re-auth | Deferred (v2) |
| 3 | Multi-course picker in CLI | Per companion doc §1: not now (one folder = one course) |
| 4 | Migrating web frontend off `accessToken` | Out of scope; web flow stays as-is |
| 5 | Switching credential to standards JWT | Deferred — would require both backend and clients to update parsers |
| 6 | New `verify_google_id_token` endpoint | Out of scope — CLI uses existing `verify_google_token` directly |

---

## 10. Glossary

| Term | Meaning |
|------|---------|
| **Tyla**         | The CLI / TUI, this repo (`tyla/` directory). |
| **Tyto**         | The Ruby/Roda backend (`tyto/backend_app`). |
| **Credential**   | Tyto's encrypted, opaque session token (Base64-urlsafe). Sometimes called "JWT" informally — it is not a standards JWT. |
| **access_token** | Google-issued short-lived token. Used by the CLI to call `verify_google_token`; Tyto exchanges it for user info via Google's userinfo endpoint. |
| **PKCE**         | Proof Key for Code Exchange (RFC 7636). Binds the authorization code to the client that initiated the flow. |
| **Whitelist**    | Implicit: the set of email addresses present in the `accounts` table on Tyto. |
