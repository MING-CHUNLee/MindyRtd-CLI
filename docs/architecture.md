# Architecture & Developer Guide

## Architecture Overview

Mindy CLI uses a **File-Based Bridge** pattern to communicate with RStudio:

1. **CLI** writes a command to `~/.mindy/commands/pending.json`.
2. **R Package (`mindy`)** runs a background loop (via `later` package) checking for this file.
3. **R Studio** executes the command via `rstudioapi` and writes the result back.
4. **CLI** reads the result and displays it.

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
