# Plan: Move i18n shared utilities out of `presentation/` into `shared/`

**Date:** 2026-04-12  
**Status:** Planned

---

## Problem

Two `application/` files violate Clean Architecture by importing from `presentation/`:

| File | Illegal import |
|---|---|
| `application/prompts/section-builders.ts:15` | `LocaleData`, `t` from `presentation/i18n` |
| `application/services/context-builder.ts:27` | `loadLocale` from `presentation/i18n` |

The dependency rule: `application/` may only import from `domain/`, `infrastructure/`, and `shared/`. Never from `presentation/`.

### Root cause

Everything in `presentation/i18n/index.ts` is framework-free and has no UI concern:
- `LocaleData` — a pure TypeScript interface
- `t()` — a pure string interpolation function (no deps)
- `loadLocale()` — loads bundled JSON (no I/O at runtime)
- The locale JSON files themselves contain **system prompt text**, not UI labels

None of this belongs in `presentation/`. It was placed there by accident of origin.

---

## Steps

### Step 1 — Create `shared/i18n/`

Move the entire i18n module to `shared/`:

```
shared/
└── i18n/
    ├── index.ts          ← re-exports everything below
    ├── types.ts          ← LocaleData interface (moved from presentation/i18n/index.ts)
    ├── t.ts              ← t() pure function (moved from presentation/i18n/index.ts)
    ├── load-locale.ts    ← loadLocale(), getAvailableLanguages(), isLanguageSupported()
    └── locales/
        ├── en.json       ← moved from presentation/i18n/locales/
        └── zh-TW.json    ← moved from presentation/i18n/locales/
```

`shared/i18n/index.ts` re-exports all public API:
```ts
export type { LocaleData } from './types';
export { t } from './t';
export { loadLocale, getAvailableLanguages, isLanguageSupported } from './load-locale';
```

### Step 2 — Make `presentation/i18n/index.ts` a re-export shim

Keep the file so any presentation-internal consumers don't break. Replace its contents with a barrel re-export:

```ts
// Backward-compat shim — real implementation lives in shared/i18n
export * from '../../shared/i18n';
```

### Step 3 — Fix `section-builders.ts`

Change line 15:
```ts
// Before
import { LocaleData, t } from '../../presentation/i18n';
// After
import { LocaleData, t } from '../../shared/i18n';
```

### Step 4 — Fix `context-builder.ts`

Change line 27:
```ts
// Before
import { loadLocale } from '../../presentation/i18n';
// After
import { loadLocale } from '../../shared/i18n';
```

### Step 5 — Verify no other presentation imports break

Run `grep -r "presentation/i18n"` across `cli/src/` after the shim is in place. Any remaining hits in `presentation/` itself are fine (they can stay or update). Any hits in `application/`, `domain/`, or `infrastructure/` are violations that need the same fix.

### Step 6 — Build and test

```bash
cd cli && bun run build
bun run test
```

---

## Rationale

### Why `shared/i18n/` and not `application/prompts/locales/`

The locale data is used by both `application/prompts/section-builders.ts` AND `application/services/context-builder.ts`. Placing it inside `prompts/` would make `context-builder.ts` import from a sibling application subfolder — unclear ownership. `shared/` is the explicit cross-cutting home for anything consumed by multiple layers.

### Why not `infrastructure/`

Infrastructure handles runtime I/O (HTTP, filesystem, process). The locale JSON files are **bundled at compile time** (TypeScript `import` of `.json`), not read from disk at runtime. They are closer to constants than to I/O — `shared/` is correct.

---

## Files touched

| File | Change |
|---|---|
| `presentation/i18n/index.ts` | Replace with re-export shim |
| `presentation/i18n/locales/en.json` | Move to `shared/i18n/locales/` |
| `presentation/i18n/locales/zh-TW.json` | Move to `shared/i18n/locales/` |
| `shared/i18n/index.ts` | **New** — barrel export |
| `shared/i18n/types.ts` | **New** — `LocaleData` interface |
| `shared/i18n/t.ts` | **New** — `t()` function |
| `shared/i18n/load-locale.ts` | **New** — `loadLocale`, helpers |
| `application/prompts/section-builders.ts` | Fix import path (1 line) |
| `application/services/context-builder.ts` | Fix import path (1 line) |
