# Tyla — Agentic CLI for R/RStudio Projects

**Tyla** is an agentic CLI tool that brings LLM-powered code editing and analysis directly into the RStudio Terminal. It detects R project files, understands your codebase, and executes multi-step instructions — with a diff review before any file is touched.

```
Tyla agent "Add error handling to the data loading pipeline"
```

---

## Features

- **Agent mode** — give a natural language instruction; Tyla scans your files, reasons with ReAct loops, proposes edits, and applies them after you review the diff
- **Ask mode** — conversational Q&A with streaming output; automatically reads relevant files to answer questions about your project
- **Session memory** — conversations persist across calls; resume previous sessions with `--resume`
- **Rollback** — revert to any earlier session checkpoint
- **Knowledge base** — store project-specific notes and conventions that the agent recalls automatically
- **Plugin system** — drop custom tools into `~/.Tyla/plugins/` to extend agent capabilities
- **Interactive TUI** — full terminal UI with live status bar (model, context usage, cost, RPM)
- **Multi-provider LLM** — OpenAI, Anthropic Claude, Azure OpenAI, Google Gemini, or local Ollama; auto-detected from API keys

---

## Requirements

- [Bun](https://bun.sh/) >= 1.0 (used instead of npm for all package management and script execution)
- Node.js >= 18 (runtime for the built CLI)
- R installed (for `run` and `install` commands)
- An API key for at least one supported LLM provider

---

## Installation

> **This project uses [Bun](https://bun.sh/) instead of npm.** Install Bun first if you haven't: `curl -fsSL https://bun.sh/install | bash`

```bash
cd Tyla
bun install
bun run build

# Link globally (optional)
bun link
```

After linking, both `Tyla` and `mrc` are available as global commands.

---

## Configuration

Create a `.env` file in your R project directory:

```env
# Pick one provider — the first key found is used automatically
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
AZURE_OPENAI_API_KEY=...
OLLAMA_HOST=http://localhost:11434   # no key needed for local Ollama

# Optional overrides
LLM_PROVIDER=anthropic               # force a specific provider
LLM_MODEL=claude-sonnet-4-20250514   # override default model
LLM_MAX_TOKENS=4096
```

Project data (sessions, knowledge base, settings) is stored in `.Tyla/` inside your working directory. Plugin tools are global at `~/.Tyla/plugins/`.

---

## Usage

### Interactive TUI (default)

```bash
Tyla
```

Launches a full-screen terminal UI. Type instructions or questions directly.

---

### Agent mode — edit files

```bash
# One-shot instruction
Tyla agent "Refactor hw11.R to use tidyverse pipes"

# Specify a workspace directory
Tyla agent "Fix the ggplot theme" --directory ./analysis

# Resume the previous session (agent remembers prior changes)
Tyla agent "Now add unit tests" --resume

# Resume a specific session by ID
Tyla agent "Continue the refactor" --session <id>

# Force a new session
Tyla agent "Start fresh" --new
```

The agent will:
1. Scan R files in the workspace
2. Read relevant files automatically
3. Reason step-by-step (ReAct loop)
4. Propose a diff for your review
5. Apply edits only after your confirmation

---

### Ask mode — Q&A without editing

```bash
Tyla ask "What does the load_data function do?"
Tyla ask "Why is my ggplot not rendering correctly?"
```

Streams the answer in real time. Uses the same session memory as agent mode.

---

### R utilities — run, install, inspect

```bash
# Execute R scripts (via RStudio listener)
Tyla r run script.R
Tyla r run "1 + 1"

# Install packages
Tyla r install ggplot2 dplyr
Tyla r install tidyverse --method bioc   # Bioconductor

# Preview generated system prompt (debug)
Tyla r context
Tyla r context --minimal --tokens
```

Scan and library inspection are available as agent tools: `Tyla ask "scan this project"`.

---

### Edit — apply a file patch directly

```bash
Tyla edit script.R
```

Opens an interactive diff review for a pending edit.

---

### Rollback — revert to an earlier turn

```bash
Tyla agent rollback         # revert last turn (interactive)
Tyla agent rollback 3       # revert to turn 3
```

---

### Knowledge base — cross-session memory

```bash
# Add a note
Tyla knowledge add "ggplot theme" "Always use theme_minimal() in this project" --tags ggplot2,style

# Add interactively (omit content)
Tyla knowledge add "data conventions"

# List all entries
Tyla knowledge list

# Search
Tyla knowledge search "ggplot"

# Remove
Tyla knowledge remove <id>
```

Entries are stored at `.Tyla/knowledge.json` and injected into agent context automatically.

---

### Plugins — extend the agent

```bash
Tyla config plugins list    # show loaded plugins
Tyla config plugins dir     # show plugin directory path
```

To add a plugin, place a `.js` file in `~/.Tyla/plugins/` that exports an object implementing the `ITool` interface (`name`, `description`, `schema`, `execute`).

---

### Context — preview generated system prompt

```bash
Tyla r context
Tyla r context --summary --tokens
```

Prints the active session ID, turn count, token usage, and cost.

---

## Architecture

The CLI follows Clean Architecture with dependency flowing inward:

```
Tyla/src/
├── domain/           # Entities, interfaces, value objects (no external deps)
├── application/
│   ├── controllers/  # Commander command handlers
│   ├── use-cases/    # Execute-ask / execute-instruction pipelines
│   ├── services/     # Orchestrator, ReAct loop, DiffEngine, KnowledgeBase, ...
│   ├── tools/        # FileScanTool, FileReadTool, RExecTool
│   └── prompts/      # Prompt templates & section builders
├── infrastructure/
│   ├── api/          # LLM gateway (OpenAI / Anthropic / Azure / Gemini / Ollama)
│   ├── persistence/  # Session & knowledge JSON repositories
│   ├── filesystem/   # File scanner, finder, resolver
│   ├── r-adapter/    # R path detection, script runner, package installer
│   ├── plugins/      # Plugin loader
│   └── config/       # Paths, settings, constants
├── presentation/
│   ├── tui/          # Ink-based interactive terminal UI
│   └── views/        # Status bar, scan result, banner
└── shared/           # Cross-cutting types and utilities
```

**Key flows:**

| Mode | Pipeline |
|------|----------|
| `agent` | Intent classify → Orchestrator → ReAct loop → Evaluator → Diff review → Apply |
| `ask` | File scan → Read relevant files → Stream LLM response |
| Multi-step | Triggered by keywords (`then`, `also`, `first`, `each`) → sequential Orchestrator steps |

---

## Development

> **This project uses [Bun](https://bun.sh/) instead of npm.**

```bash
cd Tyla

# Run without building
bun run dev -- agent "your instruction"

# Build
bun run build

# Run tests
bun test
```

---

## Project structure (full repo)

```
project-root/
├── Tyla/    # TypeScript CLI (this tool)
├── app/          # Ruby backend API (Clean Architecture, Roda)
├── workers/      # Background LLM workers (Redis + SQS)
├── config/       # Shared secrets / environment config
├── db/           # Database migrations
├── spec/         # RSpec tests
└── directives/   # SOP documents for agent behavior
```

The Ruby backend and workers are optional — the CLI talks directly to LLM APIs by default.

---

## License

MIT
