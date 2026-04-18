# TUI Bootstrap Extraction Plan

*Recorded: 2026-04-18*

## Problem

`launchTUI()` is defined inline in [index.ts:46–63](cli/src/index.ts#L46-L63),
mixing TUI startup logic (path resolution, `child_process.spawn`) into the
composition root.

**Violation — composition root carries presentation logic**

```ts
// index.ts:46–63
async function launchTUI(): Promise<void> {
    const { spawn } = await import('child_process');
    const possiblePaths = [ ... ];
    const tuiPath = possiblePaths.find(p => fs.existsSync(p)) ?? null;
    const tsx = spawn(`npx tsx "${tuiPath}"`, [], { stdio: 'inherit', ... });
    ...
}
```

`index.ts` is the composition root. Its only responsibilities are wiring
dependencies and delegating to adapters. Embedding TUI path resolution and
process-spawning here means:

1. **SRP violation** — adding or changing TUI startup requires touching the
   composition root.
2. **Discoverability** — TUI-related code is split across `index.ts` and
   `presentation/tui/`, making it harder to find.
3. **Untestable** — the spawn logic cannot be unit-tested without importing
   the full `index.ts` module.

The routing itself (`program.action()` catches the no-subcommand case) is
Commander's implicit design and is not a problem — it stays as is.

## Goal

Extract `launchTUI()` into `presentation/tui/bootstrap.ts` so that:

- `index.ts` delegates with a single `launch()` call — zero TUI implementation details.
- All TUI startup code lives inside `presentation/tui/`, co-located with
  `AppController`, views, and `index.tsx`.
- No behaviour change; the `spawn` call and path-resolution logic are moved verbatim.

## Design decisions

1. **Extract, do not refactor.** The `spawn` approach and path-resolution list
   are moved as-is. Changing the launch mechanism (e.g. direct `import` instead
   of spawning) is a separate concern and out of scope.
2. **Named export `launch()`**, not a class. The function has no state; a class
   would be unnecessary indirection.
3. **`index.ts` keeps `program.action()`** pointing at `launch()`. Commander's
   implicit routing (no subcommand → default action) is correct and stays
   unchanged — this refactor is about where the implementation lives, not how
   routing works.
4. **Option A (PresentationDispatcher) deferred.** With only two interfaces
   (CLI + TUI), a dispatcher is premature. Revisit when a third interface
   (HTTP API / VSCode extension) appears.

## Target API

```ts
// presentation/tui/bootstrap.ts
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export async function launch(): Promise<void> {
    const possiblePaths = [
        path.join(__dirname, '..', '..', 'presentation', 'tui', 'index.tsx'),
        path.join(process.cwd(), 'src', 'presentation', 'tui', 'index.tsx'),
        path.join(process.cwd(), 'cli', 'src', 'presentation', 'tui', 'index.tsx'),
    ];
    const tuiPath = possiblePaths.find(p => fs.existsSync(p)) ?? null;
    if (!tuiPath) {
        console.error('TUI source files not found. Searched in:');
        possiblePaths.forEach(p => console.error(`   - ${p}`));
        console.log('\nUse: mindy-cli agent "your instruction"');
        return;
    }
    const tsx = spawn(`npx tsx "${tuiPath}"`, [], {
        stdio: 'inherit',
        shell: true,
        cwd: process.cwd(),
    });
    tsx.on('error', (error) => { console.error('Error starting TUI:', error); });
    tsx.on('exit', (code) => { process.exit(code || 0); });
}
```

```ts
// index.ts (diff — only these lines change)
- async function launchTUI(): Promise<void> { ... }   // ← delete 18 lines
+ import { launch } from './presentation/tui/bootstrap';

  program.action(async () => {
      console.log('\n🚀 Launching interactive mode...\n');
-     await launchTUI();
+     await launch();
  });
```

## Implementation steps

1. **Create `cli/src/presentation/tui/bootstrap.ts`**
   - Copy the body of `launchTUI()` from `index.ts:46–63` into `export async function launch()`.
   - Adjust the first entry of `possiblePaths`: `__dirname` inside `bootstrap.ts`
     resolves to `…/presentation/tui/`, so the relative path to `index.tsx` is
     `path.join(__dirname, 'index.tsx')` — verify this resolves correctly in dev
     (`src/`) and built (`dist/`) modes.
   - Keep all other paths in `possiblePaths` unchanged.

2. **Update `index.ts`**
   - Add `import { launch } from './presentation/tui/bootstrap';`.
   - Delete `async function launchTUI()` (lines 46–63).
   - Replace `await launchTUI()` with `await launch()` in `program.action()`.
   - Remove the now-unused `import fs from 'fs'` if it is no longer referenced
     elsewhere in `index.ts`; keep it if still used (version-reading block uses
     `fs.readFileSync`).

3. **Verify path resolution**
   ```bash
   cd cli
   bun run dev -- # no subcommand → should launch TUI
   ```
   Confirm the TUI renders correctly in both dev (`tsx`) and optionally built
   (`node dist/index.js`) modes.

4. **Run tests and build**
   ```bash
   cd cli && bun run test
   bun run build
   ```
   No test changes expected — `launchTUI` has no unit tests and acceptance
   tests do not exercise the TUI entrypoint.

## Out of scope

- Changing the `spawn` mechanism to a direct dynamic `import()` of `index.tsx`
  (would remove the child-process boundary — a separate trade-off).
- `PresentationDispatcher` / Option A routing layer (deferred until ≥3 interfaces).
- Any change to `tui/index.tsx`, `AppController`, or other TUI internals.

## Related

- [2026-04-18-dual-entrypoints-sequence.drawio](../2026-04-18-dual-entrypoints-sequence.drawio) — AS-IS / Option B / Option A sequence diagrams
- [index.ts](cli/src/index.ts) — composition root, source of `launchTUI()`
- [presentation/tui/](cli/src/presentation/tui/) — target location for `bootstrap.ts`
- [2026-04-14-controller-composition-root-separation.md](2026-04-14-controller-composition-root-separation.md) — prior work establishing composition root discipline
