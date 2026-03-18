# Architecture & Developer Guide

## Architecture Overview

Mindy CLI uses a **File-Based Bridge** pattern to communicate with RStudio:

1. **CLI** writes a command to `~/.mindy/commands/pending.json`.
2. **R Package (`mindy`)** runs a background loop (via `later` package) checking for this file.
3. **R Studio** executes the command via `rstudioapi` and writes the result back.
4. **CLI** reads the result and displays it.

## LLM Agent Architecture

For advanced coding tasks, Mindy CLI implements an **Agentic Loop** for autonomous file editing. To maintain clean separation of concerns, the CLI defines clear roles for API and LLM communication:

- **Primary Gateway (`ruby-api-client.ts`)**: The dedicated entry point for all agentic business logic (like `resolveFiles` and `editFiles`). It delegates agent orchestrations to the Ruby backend.
- **Generic LLM Utility (`llm-controller.ts`)**: A low-level utility responsible strictly for direct LLM interactions (e.g., `sendPrompt`, `analyzeCode`). It should not contain any domain-specific logic like file resolution.
- **Standalone Interface Option**: For scenarios without the Ruby server, an `IAgentClient` interface standardizes operations, implemented by `ruby-api-client.ts` for the backend path and an optional `direct-llm-agent.ts` for a standalone path.
- **Three-Phase Tool Calling**:
  1. **Phase 1: Resolve**: Scans the workspace and sends short file snippets (e.g., first 15 lines) to identify which files need modification, saving enormous amounts of context tokens.
  2. **Phase 2: Edit**: Sends the full contents of only the chosen target files to generate the precise edits.
  3. **Phase 3: Review**: Displays a local terminal patch diff (`+`/`-`) and requests user confirmation (`[Y/n]`) before committing any writes.
- **Async Telemetry (Side-effect Logging)**: Telemetry and session logs are posted asynchronously (`SessionLogger`) to the backend via fire-and-forget, without blocking the CLI's rapid critical path.

## Project Structure

Our project structure follows **Clean Architecture** terminology to maintain a clear separation of concerns.
The dependency rule flows **inward**: `infrastructure/presentation → application → domain`. The `domain` layer has zero external dependencies.

```text
src/
├── domain/               ← Core domain — entities, value objects, interfaces (zero deps)
│   ├── entities/         ← Artifact, ConversationSession, ConversationTurn, KnowledgeEntry
│   ├── interfaces/       ← ITool (port)
│   ├── lib/              ← Domain logic helpers (agent-file-filters, model-limits, token-pricing)
│   ├── repositories/     ← Repository interfaces (ISessionRepository)
│   └── values/           ← Value objects (CacheStatus, TokenBudget)
├── application/          ← Use cases & orchestration — depends only on domain
│   ├── controllers/      ← CLI command handlers (Commander-based: agent, ask, edit, scan, …)
│   ├── services/         ← Business services (Orchestrator, DiffEngine, FileResolver, RBridge, …)
│   ├── tools/            ← Agent tool implementations (FileScanTool, FileReadTool, RExecTool)
│   └── prompts/          ← Prompt templates & section builders
├── infrastructure/       ← External I/O — APIs, persistence, plugins
│   ├── api/              ← LLMController, RubyApiClient, SessionLogger
│   ├── config/           ← Environment config & constants
│   ├── persistence/      ← SessionRepository, KnowledgeRepository (concrete impls)
│   └── plugins/          ← PluginLoader
├── presentation/         ← Views & TUI
│   ├── views/            ← Banner, ContextStatusBar, ScanResult, LibraryResult, EnvironmentResult
│   ├── tui/              ← Ink-based interactive TUI (App, ChatHistory, Header, Footer)
│   └── i18n/             ← Internationalization
├── shared/               ← Cross-cutting utilities
│   ├── types/            ← TypeScript type definitions (FileInfo, LLMTypes, Execution, …)
│   ├── utils/            ← Error handler, formatter
│   └── data/             ← Static data (package-capabilities)
└── index.ts              ← CLI entry point (Commander program setup)
```

## Setup for Development

```bash
# Install dependencies
npm install

# Watch mode (auto-rebuild on change)
npm run dev

# Run tests
npm test
```

## Testing

We use **Vitest** for unit testing.

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage
```
