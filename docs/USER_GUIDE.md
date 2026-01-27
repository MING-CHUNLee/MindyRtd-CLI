# Mindy CLI - User Guide

A command-line interface for intelligent R file analysis powered by LLM in RStudio environments.

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Default Behavior](#default-behavior)
- [Commands](#commands)
  - [scan](#scan---file-discovery)
  - [library](#library---r-environment-analysis)
  - [context](#context---llm-prompt-preview)
  - [run](#run---execute-r-code)
  - [tui](#tui---interactive-mode)
- [Configuration](#configuration)
- [Usage in RStudio](#usage-in-rstudio)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# Install dependencies
cd cli
npm install

# Run in development mode - launches interactive TUI
npm run dev

# Or build and run the compiled version
npm run build
npm start
```

After installation, simply run `mindy-cli` to launch the interactive TUI interface.

---

## Installation

### Prerequisites

- **Node.js**: >= 18.0.0
- **R**: Installed and accessible from terminal
- **RStudio** (optional): For full integration features

### Install from Source

```bash
cd cli
npm install
npm run build
```

### Global Installation

```bash
npm install -g mindy-rstudio-cli
```

After global installation, the CLI is available via two commands:
- `mindy-cli` - Full name
- `mrc` - Short alias

---

## Default Behavior

**When you run `mindy-cli` without any command, it automatically launches the interactive TUI (Terminal User Interface).**

```bash
mindy-cli              # Launches TUI
mrc                    # Same as above (short alias)
```

This is the recommended way to use Mindy CLI for most users.

---

## Commands

### scan - File Discovery

Scans the current or target directory for R-related files.

```bash
mindy-cli scan [options]
```

**Detected File Types:**
- `.R` - R scripts
- `.Rmd` - R Markdown documents
- `.RData` - R data files
- `.rds` - R serialized objects
- `.Rproj` - RStudio project files

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --directory <path>` | Target directory to scan | `.` (current) |
| `-r, --recursive` | Scan subdirectories recursively | `true` |
| `--no-recursive` | Only scan top-level directory | - |
| `-j, --json` | Output results as JSON | `false` |
| `--include-hidden` | Include hidden files and directories | `false` |

**Examples:**

```bash
# Scan current directory
mindy-cli scan

# Scan a specific directory
mindy-cli scan -d /path/to/r-project

# Scan only top-level (non-recursive)
mindy-cli scan --no-recursive

# Output as JSON (for scripting)
mindy-cli scan --json

# Include hidden files
mindy-cli scan --include-hidden
```

---

### library - R Environment Analysis

Scans and displays installed R libraries/packages.

```bash
mindy-cli library [options]
```

**Aliases:** `lib`, `packages`

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--include-base` | Include base R packages in results | `false` |
| `-f, --filter <pattern>` | Filter packages by name pattern | - |
| `-s, --sort <field>` | Sort by: `name` or `version` | `name` |
| `-j, --json` | Output results as JSON | `false` |

**Examples:**

```bash
# List all user-installed packages
mindy-cli library

# Include base R packages
mindy-cli lib --include-base

# Filter packages containing "dplyr"
mindy-cli packages --filter dplyr

# Sort by version
mindy-cli library --sort version

# Output as JSON
mindy-cli library --json
```

**Features:**
- Automatically detects R installation (Windows, macOS, Linux)
- Shows R version and library paths
- Distinguishes between base and user-installed packages

---

### context - LLM Prompt Preview

Preview the generated system prompt without calling the LLM API. Useful for testing, debugging, and understanding what context is sent to the LLM.

```bash
mindy-cli context [options]
```

**Aliases:** `ctx`, `prompt`

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --dir <directory>` | Working directory to scan | Current directory |
| `-l, --lang <language>` | Prompt language: `en` or `zh-TW` | `en` |
| `--include-base` | Include base R packages | `false` |
| `-j, --json` | Output as JSON | `false` |
| `-s, --save <filename>` | Save prompt to file | - |
| `--minimal` | Generate minimal prompt (fewer tokens) | `false` |
| `--summary` | Show only summary, not full prompt | `false` |
| `--tokens` | Show estimated token count | `false` |

**Examples:**

```bash
# Preview the generated prompt
mindy-cli context

# Show only summary
mindy-cli ctx --summary

# Generate minimal prompt (for lower API costs)
mindy-cli context --minimal

# Save prompt to a file
mindy-cli context --save my-prompt.md

# Traditional Chinese prompt
mindy-cli prompt --lang zh-TW

# Show token estimation
mindy-cli context --tokens

# Full JSON output
mindy-cli context --json
```

**Output Includes:**
- Environment summary (R version, project name, packages, files)
- Prompt statistics (estimated tokens, character count)
- Full generated system prompt (with syntax highlighting)

---

### run - Execute R Code

Execute R code in the active RStudio session.

```bash
mindy-cli run [code] [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `[code]` | R code string, `.R` file path, or `.Rmd` file path (optional) |

If no argument is provided, runs the currently open file in RStudio.

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-y, --yes` | Skip confirmation prompt | `false` |
| `-t, --timeout <ms>` | Execution timeout in milliseconds | `30000` |
| `-j, --json` | Output result as JSON | `false` |

**Execution Modes:**

```bash
# Run current file open in RStudio editor
mindy-cli run

# Execute inline R code
mindy-cli run "1 + 1"
mindy-cli run "print(summary(mtcars))"

# Execute an R script file
mindy-cli run script.R
mindy-cli run analysis/main.R

# Render an R Markdown document
mindy-cli run report.Rmd

# Skip confirmation prompt
mindy-cli run script.R --yes

# Custom timeout (60 seconds)
mindy-cli run long-script.R --timeout 60000
```

**Prerequisite:**

The Mindy R package listener must be running in RStudio:

```r
# In RStudio Console
mindy::start()
```

---

### tui - Interactive Mode

Launch the interactive Terminal User Interface.

```bash
mindy-cli tui
```

**Alias:** `interactive`

This command is equivalent to running `mindy-cli` without arguments.

**Features:**
- Real-time chat interface
- Message history
- Keyboard shortcuts (ESC or Ctrl+C to exit)

---

## Configuration

### Environment Variables

Configuration is loaded from environment variables, which can be set in a `.env` file.

**LLM Provider Configuration:**

```bash
# Provider selection (openai, anthropic, azure, ollama)
LLM_PROVIDER=openai

# API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
AZURE_OPENAI_API_KEY=...

# Model settings
LLM_MODEL=gpt-4
LLM_MAX_TOKENS=4096
LLM_TIMEOUT=30000

# Custom endpoints (optional)
OPENAI_API_BASE=https://...
AZURE_OPENAI_ENDPOINT=https://...
OLLAMA_HOST=http://localhost:11434
```

**Example `.env` file:**

```bash
# .env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-key-here
LLM_MODEL=claude-sonnet-4-20250514
LLM_MAX_TOKENS=4096
```

---

## Usage in RStudio

### Step 1: Start the Listener

In the RStudio Console, start the Mindy listener:

```r
mindy::start()
```

### Step 2: Open the Terminal

In RStudio, go to **Tools > Terminal > New Terminal** or use the Terminal pane.

### Step 3: Navigate to Your Project

```bash
cd your-r-project
```

### Step 4: Run Mindy CLI

```bash
mindy-cli
```

This launches the interactive TUI where you can:
- Ask questions about your R code
- Request code analysis
- Execute R commands
- Get LLM-powered suggestions

### Workflow Example

```bash
# 1. Scan your project files
mindy-cli scan

# 2. Check your R environment
mindy-cli library

# 3. Preview the context that will be sent to LLM
mindy-cli context --summary

# 4. Launch interactive mode
mindy-cli
```

---

## Troubleshooting

### "R not found" Error

Ensure R is installed and accessible from the terminal:

```bash
# Check if R is in PATH
Rscript --version
```

**Windows:** Add R to your PATH environment variable (e.g., `C:\Program Files\R\R-4.x.x\bin`)

**macOS/Linux:** R should be automatically available if installed via standard methods

### "Mindy listener is not running" Error

Start the listener in RStudio before using the `run` command:

```r
# In RStudio Console
mindy::start()
```

### TUI Not Launching

If the TUI fails to launch:

1. Ensure all dependencies are installed: `npm install`
2. Check that `tsx` is available: `npx tsx --version`
3. Try running a specific command instead: `mindy-cli scan`

### Permission Errors on Scan

If you encounter permission errors when scanning directories:

```bash
# Try scanning without hidden files
mindy-cli scan

# Or specify a directory you have access to
mindy-cli scan -d ~/my-project
```

### JSON Output for Scripting

All commands support JSON output for integration with other tools:

```bash
mindy-cli scan --json > files.json
mindy-cli library --json | jq '.packages'
mindy-cli context --json --summary
```

---

## Command Summary

| Command | Aliases | Description |
|---------|---------|-------------|
| (none) | - | Launch interactive TUI (default) |
| `scan` | - | Scan directory for R files |
| `library` | `lib`, `packages` | List installed R packages |
| `context` | `ctx`, `prompt` | Preview LLM system prompt |
| `run` | - | Execute R code in RStudio |
| `tui` | `interactive` | Launch interactive TUI |

**Global Options:**

| Option | Description |
|--------|-------------|
| `-v, --version` | Display version number |
| `-h, --help` | Display help information |

---

## Getting Help

```bash
# General help
mindy-cli --help

# Command-specific help
mindy-cli scan --help
mindy-cli library --help
mindy-cli context --help
mindy-cli run --help
```

---

## License

MIT License - See [LICENSE](../LICENSE) for details.
