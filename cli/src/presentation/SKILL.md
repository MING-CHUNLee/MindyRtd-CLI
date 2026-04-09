---
name: presentation-layer
description: >
  Authoritative reference for the Presentation Layer in the MindyCLI project.
  Use this skill whenever working on CLI views, TUI components, View Models,
  event mapping, status bar, i18n, or acceptance testing in the CLI.
  Triggers on: "how do I display", "view refactoring", "add a new view",
  "TUI component", "event mapper", "status bar", "format output".
---

# Presentation Layer — MindyCLI

> **Architecture:** Clean Architecture (dependency flows inward only).
> **References:**
> - Martin Fowler — [Presentation Model](https://martinfowler.com/eaaDev/PresentationModel.html)
> - Martin Fowler — [Separated Presentation](https://martinfowler.com/eaaDev/SeparatedPresentation.html)
> - Vladimir Khorikov — [DTO vs Value Object vs POCO](https://enterprisecraftsmanship.com/posts/dto-vs-value-object-vs-poco/)
> - Robert C. Martin — *Clean Architecture* (2017), Ch. 22: The Dependency Rule

---

## Layer Position

```
Presentation Layer (outermost)
  ↑ consumes
Application Layer (controllers map domain → VM, then call presentation)
  ↑ consumes
Domain Layer (entities, value objects — zero presentation knowledge)
```

**Dependency Rule (Robert C. Martin):** Source code dependencies point only **inward**. The Presentation layer is the outermost ring. It may depend on `shared/` utilities, but **never** on `domain/`, `application/services/`, or `infrastructure/`.

---

## Strict Rule: No Logic, No Domain Imports

> **The Presentation Layer renders prepared data. It never decides, validates, or transforms domain state.**

If a piece of code is deciding *what* to do rather than *how to display* it — it does not belong here.

**Forbidden imports in `presentation/`:**
```
✗ import { ConversationSession } from '../../domain/entities/...'
✗ import { ContextHealth }       from '../../domain/values/...'
✗ import { REnvironmentService } from '../../application/services/...'
✗ import { DISPLAY }             from '../../infrastructure/config/...'
✗ import { getSettings }         from '../../infrastructure/config/...'
```

**Allowed imports in `presentation/`:**
```
✓ import { ... }  from '../view-models'     (own View Models)
✓ import { ... }  from '../../shared/utils/format'
✓ import chalk    from 'chalk'
✓ import React    from 'react'
✓ import { Box }  from 'ink'
```

---

## Folder Structure

```
presentation/
├── view-models/
│   └── index.ts              # Presentation-only DTOs (boundary types)
├── views/                    # CLI output formatters
│   ├── banner.ts
│   ├── context-result.ts
│   ├── context-status-bar.ts
│   ├── environment-result.ts
│   ├── library-result.ts
│   ├── scan-result.ts
│   └── index.ts              # Barrel export
├── tui/                      # Ink-based interactive TUI (ESM)
│   ├── App.tsx               # State machine + render (no mapping logic)
│   ├── event-mapper.ts       # Pure AgentEvent → TUIMessage adapter
│   ├── index.tsx             # TUI entry point
│   ├── types.ts              # TUI-specific types (TUIMessage, AppState, …)
│   ├── package.json          # "type": "module" (ESM for Ink)
│   └── components/           # Ink React components
│       ├── Header.tsx
│       ├── Footer.tsx
│       ├── ChatHistory.tsx
│       ├── DiffReview.tsx
│       ├── StatusBar.tsx
│       ├── StreamingMessage.tsx
│       ├── ThinkingIndicator.tsx
│       ├── ScanResultCard.tsx
│       ├── LibraryResultCard.tsx
│       ├── ContextResultCard.tsx
│       ├── RExecResultCard.tsx
│       └── RInstallResultCard.tsx
└── i18n/
    ├── index.ts              # loadLocale(), t() helper
    └── locales/
        ├── en.json
        └── zh-TW.json
```

---

## 1. View Models (`presentation/view-models/index.ts`)

View Models are **flat, display-ready DTOs** that cross the Application → Presentation boundary. They are the CLI equivalent of the SOA View Object pattern.

**Rules:**
- All fields must be **primitive types** (`string`, `number`, `boolean`) or arrays of primitives — no domain entities or value objects.
- The **Application layer** (controllers) is responsible for building View Models from domain objects.
- The **Presentation layer** only reads View Models — never writes back.

```typescript
// ✓ Correct — primitive-only VM
export interface StatusBarVM {
    model:        string;        // NOT: ConversationSession
    usagePercent: number;        // NOT: TokenBudget
    health:       ContextHealthVM; // local string union — NOT: ContextHealth value object
    totalCostUSD: number;
    turnCount:    number;
}

// In the controller (Application layer):
displayStatusBar(
    { model: session.model, usagePercent: session.tokenBudget.usagePercent, ... },
    { items: settings.statusBar.items, workflowMode: mode }
);
```

---

## 2. Views (`presentation/views/`)

Two-layer pattern for every view module:

### Layer A — Pure Formatters (no I/O)

```typescript
// ✓ Returns string or string[] — never calls console.log
export function formatScanResult(vm: ScanResultVM): string[] {
    return [
        chalk.bold.underline('📁 Scan Results'),
        ...formatScanSummary(vm),
        // ...
    ];
}
```

**Why pure?**
- Testable without capturing stdout
- Reusable across CLI output and future renderers
- Composable: formatter A can call formatter B

### Layer B — Display Functions (thin I/O wrappers)

```typescript
// ✓ One statement per line — only purpose is to emit to stdout
export function displayScanResult(vm: ScanResultVM): void {
    for (const line of formatScanResult(vm)) {
        console.log(line);
    }
}
```

**Anti-pattern to avoid:**
```typescript
// ✗ Format and I/O mixed — untestable
export function displayScanResult(result: ScanResult, baseDir: string): void {
    console.log(chalk.bold('📁 Scan Results'));        // format & emit together
    for (const file of result.files.rScripts) {       // domain type reaches in
        console.log(`   ${file.path} (${file.size})`);
    }
}
```

---

## 3. TUI — App.tsx State Machine

`App.tsx` has **one job**: manage React state and render. All mapping logic lives in `event-mapper.ts`.

### State Machine

```
AppState: 'idle' → 'processing' → 'reviewing' → 'idle'
```

| State | Input captured by | Footer shows |
|---|---|---|
| `idle` | TextInput (Footer) | Text input prompt |
| `processing` | Nothing | ThinkingIndicator |
| `reviewing` | DiffReview (Y/N) | DiffReview component |

### Responsibilities of App.tsx

| Concern | Belongs in App.tsx? |
|---|---|
| `useState` / `useRef` hooks | ✓ Yes |
| React render tree | ✓ Yes |
| AgentEvent → TUIMessage mapping | ✗ No — use event-mapper.ts |
| Streaming token accumulation | ✓ Yes (side effect from event-mapper) |
| Agent initialization (dynamic import) | ✓ Yes |
| Approval promise | ✓ Yes |

---

## 3a. TUI — Components (`tui/components/`)

TUI components accept **View Models**, not flat ad-hoc props. The VM is the single source of truth for what data a component needs.

```typescript
// ✓ Correct — props type = VM + config
interface StatusBarProps {
    vm:     StatusBarVM;
    config: StatusBarDisplayConfig;
}
const StatusBar: React.FC<StatusBarProps> = ({ vm, config }) => { ... }

// ✗ Wrong — flat props duplicate VM fields
interface StatusBarProps {
    model:        string;
    usagePercent: number;
    health:       'healthy' | 'warning' | 'critical' | 'overflow_risk';
    // ...
}
```

If a component needs only a subset of a VM, use `Pick<>` rather than defining a new interface:

```typescript
// ✓ Narrowed VM — no new interface needed
interface HeaderProps {
    vm: Pick<StatusBarVM, 'model' | 'turnCount'>;
}
```

**Anti-pattern to avoid:** defining a component-local type that mirrors an existing VM field-for-field. This is the duplication that broke `StatusBar.tsx` before the refactor — it had its own `StatusBarProps` with `model`, `usagePercent`, `health`, etc., while `StatusBarVM` already defined the same shape.

---

## 4. TUI — Event Mapper (`event-mapper.ts`)

Pure adapter from the AgentService domain events to the Presentation `TUIMessage` type.

```typescript
// Pure — no React, no state, no console.log
export function mapAgentEventToMessage(event: AgentEvent): MappedEvent {
    switch (event.type) {
        case 'session_loaded': return { message: makeMessage('status', content) };
        case 'diff_proposed':  return { sideEffect: { pendingReview, nextAppState: 'reviewing' } };
        case 'stream_token':   return { sideEffect: { streamingToken: event.data.token } };
        // ...
    }
}
```

**Two return channels:**
- `message` — a `TUIMessage` to append to the chat history
- `sideEffect` — state mutations needed for streaming / diff review / status bar

App.tsx applies both:
```typescript
const { message, sideEffect } = mapAgentEventToMessage(event);
if (message)            addMessage(message);
if (sideEffect?.statusData) setStatusData(sideEffect.statusData);
```

---

## 5. TUI — ESM/CJS Interop

The TUI is an ESM island inside a CJS project. Key constraints:

| Rule | Why |
|---|---|
| `tui/package.json` has `"type": "module"` | Ink requires ESM top-level await |
| `tsconfig.json` excludes TUI directory | CJS compiler can't handle ESM |
| Entry point spawns `tsx tui/index.tsx` as child process | Bridges CJS ↔ ESM |
| AgentService loaded via `await import()` | ESM can't statically import CJS named exports |

```typescript
// ✓ Safe dynamic import of CJS module from ESM context
const mod = await import('../../application/facade/agent-service.js');
const AgentServiceClass = mod.AgentService;
```

---

## 6. i18n (`presentation/i18n/`)

Locale files define UI strings for locale-specific output. They are pure data — no logic.

```typescript
// Load locale
const locale = loadLocale('zh-TW');
// Translate with interpolation
const text = t(locale, 'environment.userPackages.title', { count: 10 });
```

**Rule:** The i18n module belongs in the Presentation layer because it governs *how strings appear to the user*, not *what data to show*.

---

## 7. Controller Responsibilities (Application Layer)

The **Application layer controllers** are responsible for the translation step:

```
domain/infrastructure data  →  [controller maps]  →  View Model  →  presentation view
```

```typescript
// ✓ Controller (application layer) builds the VM:
displayStatusBar(
    {
        model:        session.model,
        usagePercent: session.tokenBudget.usagePercent,   // unpack domain value object
        health:       session.tokenBudget.health,
        totalCostUSD: session.totalCostUSD,
        // ...
    },
    { items: settings.statusBar.items, workflowMode: mode },
);
```

---

## 8. Testing the Presentation Layer

### Unit Tests for Formatters

Because formatters are pure functions, they can be tested without any mocks:

```typescript
// ✓ Pure formatter test — no console capture needed
describe('formatScanSummary', () => {
    it('counts files correctly', () => {
        const vm = buildScanResultVM({ rScripts: [{ path: 'a.R', size: 100 }] });
        const lines = formatScanSummary(vm);
        expect(lines.join('\n')).toContain('1');
    });
});
```

### Unit Tests for Event Mapper

```typescript
// ✓ Tests the mapping logic without React
describe('mapAgentEventToMessage', () => {
    it('maps session_loaded to status message', () => {
        const { message } = mapAgentEventToMessage({
            type: 'session_loaded',
            data: { sessionId: 'abc123', turnCount: 0, model: 'claude-3-5' },
        });
        expect(message?.type).toBe('status');
        expect(message?.content).toContain('abc123');
    });
});
```

### Acceptance Tests (BDD)

Use `bun test` for integration/acceptance-level tests. Follow the Given/When/Then structure:

```typescript
describe('scan command', () => {
    it('(HAPPY) should display scan results for a valid R directory', async () => {
        // GIVEN: a directory with R files
        // WHEN: scan command runs
        // THEN: output contains "Scan Results" and file counts
    });
});
```

---

## Summary: Presentation Layer Rules

1. **No domain imports.** `domain/`, `application/services/`, and `infrastructure/` are forbidden inside `presentation/`.
2. **View Models are the boundary.** Controllers map domain → VM; presentation only reads VMs.
3. **Formatters are pure.** `formatXxx()` functions return `string | string[]`, never call `console.log`.
4. **Display functions are thin.** `displayXxx()` calls `console.log` on formatter output — nothing else.
5. **App.tsx = state + render only.** All AgentEvent → TUIMessage mapping lives in `event-mapper.ts`.
6. **ESM island.** The TUI is an ESM module in a CJS project; always use dynamic `import()` for CJS modules.
7. **i18n belongs here.** Locale loading governs display — it's a presentation concern.
8. **Test formatters as pure functions.** No mocks, no stdout capture needed.
