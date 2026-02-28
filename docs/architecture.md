# Architecture & Developer Guide

## Architecture Overview

Mindy CLI uses a **File-Based Bridge** pattern to communicate with RStudio:

1. **CLI** writes a command to `~/.mindy/commands/pending.json`.
2. **R Package (`mindy`)** runs a background loop (via `later` package) checking for this file.
3. **R Studio** executes the command via `rstudioapi` and writes the result back.
4. **CLI** reads the result and displays it.

## LLM Agent Architecture

For advanced coding tasks, Mindy CLI implements an **Agentic Loop** for autonomous file editing, emphasizing an off-critical-path design to maximize speed and developer experience:

- **Direct API Communication**: For agent operations, the CLI communicates directly with LLM providers (e.g., Google Gemini, Anthropic, OpenAI) via the `LLMController`, bypassing the Ruby/R backend bridge entirely.
- **Three-Phase Tool Calling**:
  1. **Phase 1: Resolve**: Scans the workspace and sends short file snippets (e.g., first 15 lines) to the LLM to identify which files need modification, saving enormous amounts of context tokens.
  2. **Phase 2: Edit**: Sends the full contents of only the chosen target files to generate the precise edits.
  3. **Phase 3: Review**: Displays a local terminal patch diff (`+`/`-`) and requests user confirmation (`[Y/n]`) before committing any writes.
- **Async Telemetry (Side-effect Logging)**: Telemetry and session logs are posted asynchronously (`SessionLogger`) to the backend via fire-and-forget, without blocking the CLI's rapid critical path.

## Project Structure

- `src/commands/` - CLI command definitions & handlers
- `src/services/` - Business logic (File scanning, R-Bridge, Context building)
- `src/config/` - Environment configuration
- `src/types/` - TypeScript definitions

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
