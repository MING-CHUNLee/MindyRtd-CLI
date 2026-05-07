# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the `tyla/` directory (`cd tyla` first):

> **This project uses [Bun](https://bun.sh/) instead of npm.** Use `bun` for all package management and script execution.

```bash
bun run build        # Compile TypeScript → dist/
bun run dev          # Run via tsx (no build needed)
bun run test         # Run all tests via Vitest — must cd cli first; do NOT use "bun test"
bun run test -- path/to/test.test.ts   # Run a single test file
bun run tyla -- agent "instruction"  # Run CLI in dev mode
```

To run the built CLI:
```bash
node dist/index.js agent "instruction"
```

## Architecture

The codebase follows **Clean Architecture** with four layers. Dependencies only point inward (presentation/infrastructure → application → domain).

```
tyla/src/
├── domain/          # No external deps — entities, interfaces, value objects
├── application/     # Business logic — use-cases, services, tools, prompts
├── infrastructure/  # External I/O — LLM API, persistence, filesystem, R adapter
├── presentation/    # Ink-based TUI, views, i18n
└── shared/          # Cross-cutting types and utils
```

### Two main pipelines

| Command | Pipeline |
|---------|----------|
| `ask`   | File scan → read relevant files → stream LLM response |
| `agent` | Classify intent → Orchestrator → ReAct loop → Evaluator → diff review → apply edits |

The `agent` command supports **multi-step mode** (triggered by keywords `then`, `also`, `first`, `each` in the instruction) which runs sequential Orchestrator steps.

## Slash commands (TUI)

The interactive TUI supports quick slash commands:

- `/run` — run the current file in RStudio immediately (no LLM)
- `/rollback list` — list turns in the current session
- `/rollback <n>` — rollback current session to after turn `n`
- `/rollback session list` — list recent saved sessions
- `/rollback session <id> <n>` — rollback a saved session to after turn `n`

### Key files

- `src/index.ts` — CLI entry point, registers all Commander commands
- `src/application/services/agent-service.ts` — thin facade; constructs use cases and manages session lifecycle; all I/O via events (never `console.log` directly)
- `src/application/use-cases/execute-ask-use-case.ts` — ask pipeline
- `src/application/use-cases/execute-instruction-use-case.ts` — edit/agent pipeline
- `src/application/services/react-loop.ts` — ReAct loop (`[THOUGHT]`/`[ACTION]`/`[ANSWER]` markers)
- `src/infrastructure/api/llm-controller.ts` — multi-provider LLM gateway (OpenAI, Anthropic, Azure, Gemini, Ollama)
- `src/infrastructure/config/paths.ts` — all persistence paths; sessions/knowledge at `<cwd>/.tyla/`, plugins at `~/.tyla/plugins/`

### Event-driven design

`AgentService` emits typed events instead of writing to stdout. Controllers listen to events and render UI. This keeps business logic testable and decoupled from presentation.

### ReAct loop format

The LLM must emit structured markers:
- `[THOUGHT] ...` — reasoning step
- `[ACTION {"tool":"name","input":{}}]` — tool call
- `[ANSWER] ...` — final response

Tool schemas are injected into the system prompt with full parameter names, types, required flags, and examples.

### Phase 3 safety gate

Edit artifacts (JSON array `[{"path":"...","content":"..."}]`) from LLM output are intercepted, diffed, and presented to the user for approval before being written to disk.

### Testing

Tests use **Vitest**. Mock class constructors with `vi.fn(function() { return {...}; })` — arrow functions cannot be used with `new`. DI via `AgentServiceDeps` and similar dep interfaces enables unit testing without network calls.

## Project structure rules

- Planning documents (architecture plans, gap analyses) go in `plans/` — not `docs/`
- Auto-skill experience files: `.agents/skills/auto-skill/experience/`
- Auto-skill knowledge-base files: `.agents/skills/auto-skill/knowledge-base/`
- Do **not** create `experience/` or `knowledge-base/` at the project root
