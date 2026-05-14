# Tyto Backend Spec — CLI Login via Google OAuth (access_token)

> **Audience:** Tyto backend engineer
> **Date:** 2026-05-10
> **Companion (full design):** [2026-05-10-authxn-tyla-tyto-google-sso.md](2026-05-10-authxn-tyla-tyto-google-sso.md)
> **TL;DR:** The CLI reuses the **existing** `verify_google_token` endpoint — no new auth endpoint needed. The only backend addition is `GET /api/account/current_context` for post-login context fetch.

---

## 1. Context (90 seconds)

The Tyla CLI runs an OAuth 2.0 + PKCE flow against Google directly. Although the flow also produces an `id_token`, the CLI will use the **`access_token`** and POST it to the existing Tyto endpoint — the same endpoint the web frontend uses today.

```http
POST /api/auth/verify_google_token
Content-Type: application/json

{ "accessToken": "ya29...." }
```

The existing `sso_auth/gateway.rb` calls Google's userinfo endpoint with the access_token and `sso_auth/mapper.rb` transforms the response to domain fields — this pipeline already handles everything the CLI needs.

**No new auth infrastructure, no JWKS, no JWT verification library.**

After login the CLI fetches course / assignment context from a new endpoint:

```http
GET /api/account/current_context
Authorization: Bearer <credential>
```

> **Why access_token instead of id_token?** Google's PKCE token response returns both. Using `access_token` lets us reuse the existing backend pipeline unchanged, eliminating all new auth infrastructure risk.

---

## 2. CLI OAuth Scope Requirement

The CLI must request these three scopes when initiating the PKCE flow so that Google's userinfo endpoint returns the fields the existing `sso_auth/mapper.rb` expects (`email`, `name`, `picture`):

```
openid email profile
```

This is a CLI-side change only — no backend impact.

---

## 3. One New Endpoint

### `GET /api/account/current_context`  (post-login context fetch)

**Request:**
```http
GET /api/account/current_context
Authorization: Bearer <credential>
```

**Responses:**

| Status | Body | When |
|--------|------|------|
| 200 | `{ selectedCourse: { id, name }, currentAssignment: { id, title, dueAt, mode, starterFile, specFile, submissionEndpoint } \| null }` | Authenticated; assignment may be null if none active |
| 401 | `{ error: "Invalid or missing credential" }` | Bad / missing Bearer token |
| 404 | `{ error: "No enrolled course" }` | Account exists but not enrolled in any course |

**Field semantics for `currentAssignment`:**
- `id` — assignment id (string, e.g. `"HW2"`)
- `title` — human-readable
- `dueAt` — ISO 8601 with timezone
- `mode` — one of `"tutor-socratic" | "tutor-guide" | "solver"` (teacher-selected; CLI maps to a built-in policy file)
- `starterFile` — path *relative to the assignment package*
- `specFile` — same, relative path to the spec PDF
- `submissionEndpoint` — full URL the CLI POSTs the submission to

**One active course / one active assignment per student in this iteration.** Multi-course picking is out of scope.

---

## 4. Implementation Plan

### 4.1 Configuration

Add to `config/secrets_example.yml` (and prod / staging secrets):

```yaml
TYLA_GOOGLE_CLIENT_ID: '<desktop-app-client-id>.apps.googleusercontent.com'
```

> **Important:** This is a **separate Google Cloud OAuth client** from the web one — type **"Desktop App"**. I'll register it on Google Cloud Console; you only need to consume the env var for any client-id validation you add later.

No new database migrations required.

### 4.2 New files

```
app/
└── application/
    └── controllers/
        └── routes/
            └── (edit) account.rb    # add /current_context route
```

That's it. No new infrastructure files.

### 4.3 `GET /current_context` route

**`routes/account.rb`** — add `r.on 'current_context'` (Bearer-protected). Use the existing `AuthToken::Mapper#from_auth_header` to resolve `account_id`. Service: `Service::Account::FetchCurrentContext.new.call(account_id:)`. Implementation should reuse existing repository methods on `accounts` / `courses` / `assignments`; no new tables.

```ruby
r.on 'current_context' do
  r.get do
    capability = AuthToken::Mapper.new.from_auth_header(r.env['HTTP_AUTHORIZATION'])
    case Service::Account::FetchCurrentContext.new.call(account_id: capability.account_id)
    in Success(context)
      context.to_json
    in Failure(api_result)
      response.status = api_result.http_status_code
      api_result.to_json
    end
  rescue AuthToken::Mapper::MappingError => e
    response.status = 401
    { error: 'Invalid or missing credential' }.to_json
  end
end
```

---

## 5. Required Tests

### 5.1 `current_context` route (`spec/routes/account_spec.rb`)

- 200 with expected shape (course + assignment)
- 200 with `currentAssignment: null` (enrolled but no active assignment)
- 401 — missing `Authorization` header
- 401 — malformed / expired Bearer token
- 404 — account not enrolled in any course

### 5.2 Regression

- **Existing `verify_google_token` route and service specs must continue to pass unchanged** — the CLI uses this endpoint as-is.

---

## 6. Out of Scope

- Any new auth endpoint on the backend — CLI uses `verify_google_token` directly
- `id_token` / JWT / JWKS verification on the backend
- Encrypted starter-file download (separate stage-3 design)
- Refresh tokens / silent re-auth (CLI re-runs login when expired)
- Migrating the web frontend off `accessToken`
- Switching the Tyto credential format to a standards JWT
- Multi-course picker

---

## 7. Sequencing & Rollout

1. Land `FetchCurrentContext` service + `current_context` route.
2. Hand the staging URL + a test account email to the CLI side; smoke-test with a real Google Desktop OAuth client hitting `verify_google_token` with an `access_token`.

No DB migration, no breaking change to the web frontend, no rollback risk.

---

## 8. Open Questions for You

1. **Is "one enrolled course per account" already true** in the data model, or do we need an `is_active` / `is_current` flag on enrollments? If multiple courses per account is possible today, we'll need an explicit "selected course" notion — please flag.
2. **Where should `Service::Account::FetchCurrentContext` live?** Sketched under `services/accounts/`; let me know if you'd rather scope it under `services/courses/` given existing conventions.
3. **Logging:** any auth-event logging convention I should follow for the new endpoint?
