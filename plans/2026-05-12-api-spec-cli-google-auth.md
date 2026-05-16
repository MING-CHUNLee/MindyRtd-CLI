# API Specification — Tyla CLI × Tyto Backend (Google OAuth)

> **Version:** 1.2  
> **Date:** 2026-05-16  
> **Base URL:** `https://<tyto-host>/api`

---

## Authentication

The CLI uses the **OAuth 2.0 + PKCE** flow against Google and exchanges the resulting `access_token` with Tyto.

All subsequent requests must include the JWT returned from the login endpoint:

```
Authorization: Bearer <token>
```

---

## Setup Flow (2 calls)

**Before (v1.1 — 3 calls):**
1. `POST /auth/verify_google_token`
2. `GET /account/current_context?courseId=:courseId`
3. `GET /assignments/:assignmentId/package`

**After (v1.2 — 2 calls):**
1. `POST /auth/verify_google_token` — returns `{ student, auth, courses[] }`
2. `GET /assignments/:assignmentId/package?courseId=:courseId` — returns ZIP + assignment metadata

---

## CLI Responsibilities

The following concerns are handled entirely by tyla (not tyto):

- **PKCE OAuth 2.0 flow** — tyla initiates the Google authorization, handles the redirect, and exchanges the code for an `access_token`.
- **Local auth state** — JWT and expiry are persisted to `~/.tyla/auth.json`; this token is reused until expiry.
- **Assignment context** — `./.ai-tutor-config` stores `{ student, auth, selectedCourse, currentAssignment }` after setup.
- **Skip redundant downloads** — if `./assignments/<courseId>-<assignmentId>/` already exists on disk, tyla skips the `GET /package` call.
- **Solutions isolation** — `solutions/` content received from `GET /documents` is held in memory and passed directly to the LLM. It is **never** written to disk.

---

## Endpoints

### 1. Verify Google Token (Login)

> **When called:** Once per login session. The returned JWT is reused until `expiresAt`.

![Login Flow](./img/Login%20Flow.drawio.png)

Exchange a Google `access_token` for a Tyto JWT and initial workspace context.

```
POST /auth/verify_google_token
```

**Request**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accessToken` | string | yes | Google OAuth `access_token` obtained via PKCE flow |

```json
{
  "accessToken": "ya29...."
}
```

> **Note:** The CLI must request scopes `openid email profile` when initiating the PKCE flow.

**Response — 200 OK**

```json
{
  "student": {
    "id": "s110001",
    "email": "student@edu.tw",
    "displayName": "Ming-Chun Lee"
  },
  "auth": {
    "token": "eyJhbGc...",
    "expiresAt": "2026-05-07T00:00:00Z"
  },
  "courses": [
    { "id": "CS101", "name": "Foundation of Programming" },
    { "id": "CS201", "name": "Data Structures" },
    { "id": "EE305", "name": "Computer Architecture" }
  ]
}
```

The CLI handles course selection locally:
- **Single course** — auto-select, proceed immediately.
- **Multiple courses** — render TUI picker; user navigates with ↑/↓ and confirms with Enter.

After selection the CLI writes `~/.tyla/auth.json` and calls `GET /assignments/:assignmentId/package?courseId=:courseId` to fetch the assignment package and metadata in one request.

**Field Reference — `student`**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Student identifier |
| `email` | string | Email address from Google account |
| `displayName` | string | Full name from Google account |

**Field Reference — `auth`**

| Field | Type | Description |
|-------|------|-------------|
| `token` | string | Tyto JWT for all subsequent API calls |
| `expiresAt` | string (ISO 8601) | Token expiry timestamp (UTC) |

**Field Reference — `courses[]`**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Course identifier (e.g. `"CS201"`) |
| `name` | string | Human-readable course name |

**Error Responses**

| Status | Body | When |
|--------|------|------|
| 401 | `{ "error": "Invalid or missing token" }` | Google token invalid or expired |
| 404 | `{ "error": "No enrolled course" }` | Account exists but is not enrolled in any course |

---

### 2. Download Assignment Package

> **When called:** Once per assignment setup (start of week). Skipped if the local folder already exists.

Download the encrypted assignment ZIP and assignment metadata for the active assignment.

```
GET /assignments/:assignmentId/package?courseId=:courseId
```

**Path Parameter**

| Parameter | Description |
|-----------|-------------|
| `assignmentId` | Assignment identifier (e.g. `HW2`) |

**Query Parameter**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `courseId` | string | yes | Course identifier chosen by the CLI (e.g. `CS201`) |

**Request Headers**

```
Authorization: Bearer <token>
```

**Response — 200 OK**

```
Content-Type: application/zip
Content-Disposition: attachment; filename="CS201-HW2.zip"
X-Assignment-Course-Id: CS201
X-Assignment-Course-Name: Data Structures
X-Assignment-Id: HW2
X-Assignment-Title: Homework 2
X-Assignment-Due-At: 2026-05-07T23:59:00+08:00
X-Assignment-Mode: tutor-guide
X-Assignment-Starter-File: CS201-HW2/student-files/student01.Rmd
X-Assignment-Spec-File: CS201-HW2/assignment/HW2.md
X-Assignment-Submission-Endpoint: https://api.example.com/submit

<binary ZIP content>
```

> **Open question — metadata delivery format.** Three options are under consideration:
> - **Response headers** (current spec) — simple, no content-type change.
> - **JSON body with signed ZIP URL** — returns JSON with a pre-signed download URL; client makes a second GET to fetch the ZIP.
> - **Multipart response** — single response body with a JSON part and a binary part.
>
> This spec uses response headers until a final decision is made.

The ZIP unpacks directly to the local working directory. Paths are relative to `assignments/`:

```
assignments/
└── CS201-HW2/
    ├── student-files/   ← plaintext — student reads and edits these
    ├── tutors/          ← plaintext — tutor policy files (socratic.md, guide.md, …)
    ├── notes/           ← plaintext — class handouts
    ├── assignment/      ← plaintext — spec documents (HW2.md / HW2.tex)
    └── solutions/       ← encrypted — student cannot open; decrypted server-side only
```

`starterFile` and `specFile` are paths relative to `assignments/` (e.g. `CS201-HW2/student-files/student01.Rmd`).

The CLI must **not** attempt to decrypt `solutions/`. Plaintext solution content is only available via `GET /assignments/:id/documents`.

**Field Reference — `X-Assignment-*` headers**

| Header | Type | Description |
|--------|------|-------------|
| `X-Assignment-Course-Id` | string | Course identifier |
| `X-Assignment-Course-Name` | string | Human-readable course name |
| `X-Assignment-Id` | string | Assignment identifier (e.g. `"HW2"`) |
| `X-Assignment-Title` | string | Human-readable assignment name |
| `X-Assignment-Due-At` | string (ISO 8601) | Due date with timezone |
| `X-Assignment-Mode` | enum | LLM tutoring policy: `"tutor-socratic"` / `"tutor-guide"` |
| `X-Assignment-Starter-File` | string | Path relative to `assignments/` |
| `X-Assignment-Spec-File` | string | Path relative to `assignments/` |
| `X-Assignment-Submission-Endpoint` | string | Full URL the CLI POSTs the submission to |

**Error Responses**

| Status | Body | When |
|--------|------|------|
| 401 | `{ "error": "Invalid or missing credential" }` | Missing or expired token |
| 403 | `{ "error": "Not enrolled in this assignment" }` | Student not enrolled |
| 404 | `{ "error": "Assignment not found" }` | Invalid `assignmentId` or `courseId` |

---

### 3. Request Assignment Documents (for LLM context)

> **When called:** Every time the student asks a question (not cached — always fetches fresh decrypted content).

![Question Flow](./img/Question%20Flow.drawio.png)

Fetch decrypted assignment documents from the backend to use as LLM context. The student's local copy of `solutions/` is encrypted; this endpoint is the only way to obtain the plaintext content. The CLI passes the returned documents directly to the external LLM API — they are never written to disk.

```
GET /assignments/:assignmentId/documents
```

**Path Parameter**

| Parameter | Description |
|-----------|-------------|
| `assignmentId` | Assignment identifier (e.g. `HW2`) — read from `.ai-tutor-config` → `currentAssignment.id` |

**Query Parameter**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `types` | string (comma-separated) | no | Document types to include: `hw`, `solutions`, `notes`. Defaults to `hw,notes`. |

**Request Headers**

```
Authorization: Bearer <token>
```

**Response — 200 OK**

```json
{
  "documents": [
    {
      "type": "hw",
      "filename": "HW2.md",
      "content": "# Homework 2\n..."
    },
    {
      "type": "solutions",
      "filename": "HW2-solution1.Rmd",
      "content": "..."
    },
    {
      "type": "notes",
      "filename": "class-handout.md",
      "content": "..."
    }
  ]
}
```

**Security model**

- `solutions` documents are stored encrypted on the backend; this endpoint decrypts them server-side before responding.
- The student's local ZIP contains an encrypted copy of `solutions/` that cannot be opened without this endpoint.
- The CLI receives plaintext in memory and passes it as LLM context — it must **not** persist `solutions` content to disk.

**Error Responses**

| Status | Body | When |
|--------|------|------|
| 401 | `{ "error": "Invalid or missing credential" }` | Missing or expired token |
| 403 | `{ "error": "Not enrolled in this assignment" }` | Student not enrolled |
| 404 | `{ "error": "Assignment not found" }` | Invalid `assignmentId` |

---

## CLI Local State After Setup

The CLI persists setup results to two locations:

| Path | Content | Purpose |
|------|---------|---------|
| `~/.tyla/auth.json` | `{ "token": "...", "expiresAt": "..." }` | JWT reused for all future API calls |
| `./.ai-tutor-config` | `{ student, auth, selectedCourse, currentAssignment }` — populated from login (step 1) and package headers (step 2) | Per-project context; different directories can have different assignments |
| `./assignments/<course>-<id>/` | Unpacked ZIP contents (student-files/, tutors/, notes/, assignment/, solutions/) | Student working directory |

> `.ai-tutor-config` is project-scoped so that different working directories can represent different course environments.

---

## Question Flow

```
CLI                         Google        Tyto Backend      GitHub LLM API
 │                              │               │                  │
 │  ── setup (once per assignment) ───────────  │                  │
 │── PKCE authorize ────────────►               │                  │
 │◄─ access_token ─────────────┘               │                  │
 │                                              │                  │
 │── POST /auth/verify_google_token ──────────► │                  │
 │◄─ { student, auth, courses[] } ────────────  │                  │
 │  [write ~/.tyla/auth.json]                   │                  │
 │                                              │                  │
 │  [single course]  → auto-select              │                  │
 │  [multiple courses] → TUI picker             │                  │
 │                                              │                  │
 │── GET /assignments/:id/package?courseId ───► │                  │
 │◄─ <ZIP> + X-Assignment-* headers ─────────  │                  │
 │  [unpack to ./assignments/<courseId>-<id>/]  │                  │
 │  [write ./.ai-tutor-config from headers]     │                  │
 │  student-files/ notes/ assignment/ → plaintext               │
 │  solutions/ → encrypted blob (cannot open)  │                  │
 │                                              │                  │
 │  ── student asks a question ──────────────────────────────────  │
 │── GET /assignments/:id/documents ──────────► │                  │
 │   [Authorization: Bearer token]              │                  │
 │   [assignmentId from .ai-tutor-config]       │                  │
 │◄─ { documents: [hw, solutions, notes] } ───  │                  │
 │  [hold in memory, never write to disk]       │                  │
 │                                              │                  │
 │── LLM key + context + documents + question ────────────────────►│
 │◄─ AI response (streamed) ──────────────────────────────────────  │
```

---

## Out of Scope (this version)

- `id_token` / JWT / JWKS verification on the backend
- Refresh tokens or silent re-auth (CLI re-runs login when token expires)
- Persisting selected course on the backend (selection is CLI-local only)
- Conditional ZIP download (e.g. `If-None-Match` / version check)
- `GET /account/current_context` — removed in v1.2 (merged into `GET /package`)
