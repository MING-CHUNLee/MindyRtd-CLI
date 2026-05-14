# AI Tutor Login Init — Design Decisions

> Discussion date: 2026-04-30
> Scope: `ai-tutor login init` flow, backend config format, policy architecture, logging

---

## 1. Backend Response Format (after login)

After authentication completes, the backend copies assignment files to the student's local CLI directory (encrypted) and returns the following config, saved as `.ai-tutor-config` in the current working directory:

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
  "selectedCourse": {
    "id": "CSDS",
    "name": "Computer Science Data Structures"
  },
  "currentAssignment": {
    "id": "HW2",
    "title": "Homework 2",
    "dueAt": "2026-05-07T23:59:00+08:00",
    "mode": "tutor-guide",
    "starterFile": "student-files/Hw2.Rmd",
    "specFile": "assignment/HW 02.docx.pdf",
    "submissionEndpoint": "https://api.example.com/submit"
  }
}
```

### Decisions

- **Files are copied from backend and encrypted locally.** Students cannot read raw policy or answer files.
- **`learningObjectives` are NOT stored in the CLI config.** They are backend-only, used for the teacher's Learning Insight Dashboard. The CLI records student prompts and sends them to the backend for analysis.
- **No `policyFile` path in config.** The `mode` field resolves to a built-in policy file at runtime (see Section 3).
- **No `telemetry.endpoint` in config.** Logging endpoints are managed via env vars (`API_HOST`, `ANALYTICS_BACKEND_URL`) and `RUBY_API` constants — already handled by the existing logging infrastructure.
- **Students cannot switch weeks.** Late submissions are final. The `currentAssignment` always reflects the current week's active assignment.
- **One folder = one course.** Course switching via a TUI command is out of scope for now.

---

## 2. Logging — Telemetry Design

### Existing infrastructure (no changes needed)

| Gateway | Endpoint | Purpose |
|---------|----------|---------|
| `RubyLogGateway` | `POST /events` | Structured event log (event type + data payload) |
| `SessionLogGateway` | `POST /events` | Full prompt/response log with timing |

### Auth token injection (required change)

Both gateways currently send **no auth header**. After login, the JWT from `.ai-tutor-config` must be injected:

```typescript
// RubyLogGateway / SessionLogGateway constructor
constructor(private authToken?: string) { ... }

// In postEvent / postLog — add to headers:
...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
```

### Tutor-specific telemetry — Option B (chosen)

Do NOT add new event types. Use the existing `ask` event and carry tutor metadata in the `data` field:

```typescript
// LogEvent.event stays: 'resolve' | 'edit' | 'ask' | 'agent' | 'error'

// Example tutor interaction log
{
  event: 'ask',
  data: {
    questionType: 'Concept',  // or 'Syntax'
    hintCount: 2,
    courseId: 'CSDS',
    assignmentId: 'HW2'
  }
}
```

---

## 3. Policy Architecture

### Two-layer design

| Layer | Location | Owner |
|-------|----------|-------|
| System base policy | `src/agent/<mode>.md` (built into CLI) | Engineering |
| Course mode selection | `mode` field in `.ai-tutor-config` | Teacher (via web admin) |

The teacher selects a mode in the web admin panel. The backend records the mode and returns it in the config. The CLI resolves `mode` → built-in policy file at runtime. **Students never see the policy file directly.**

### Mode → file mapping

```
"tutor-socratic" → src/agent/tutor-socratic.md  ✓ exists
"tutor-guide"    → src/agent/tutor-guide.md      (to be created — content in fixtures as placeholder)
"solver"         → src/agent/solver.md            (to be created)
```

### Policy file status

- `src/agent/tutor-socratic.md` — **exists**
- `tests/fixtures/assignments/CSDS-HW2/tutors/tutor-guide.md` — **placeholder only**, content should be moved to `src/agent/tutor-guide.md`
- `src/agent/solver.md` — **not yet created**

---

## 4. Open Items

| # | Item | Priority |
|---|------|----------|
| 1 | Inject auth token into `RubyLogGateway` and `SessionLogGateway` | High |
| 2 | Create `src/agent/tutor-guide.md` from fixture placeholder content | High |
| 3 | Implement `ai-tutor login init` command (OAuth Device Flow → write encrypted `.ai-tutor-config`) | High |
| 4 | Implement mode → system prompt injection in ask pipeline | High |
| 5 | Create `src/agent/solver.md` | Medium |
