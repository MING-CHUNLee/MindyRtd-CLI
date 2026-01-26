# Mindy CLI (mindy-rstudio-cli)

🔬 **Intelligent RStudio Assistant powered by LLM**

The **Mindy CLI** transforms your terminal into an intelligent companion for RStudio. It scans your R environment, understands your project context, and orchestrates code execution directly within your active RStudio session.

---

## � User Guide

### 1. Prerequisites

Before using Mindy CLI, ensure you have the following installed:

- **RStudio IDE** (v2023.03+ recommended)
- **Node.js** (v18.0.0+)
- **R Package**: `mindy` (The bridge between CLI and RStudio)

### 2. Installation

#### Step A: Install the R Bridge Package
You need the `mindy` R package installed to allow the CLI to communicate with RStudio.
Run this in your R console:

```r
# Install from GitHub
remotes::install_github("MING-CHUNLee/MindyRtd-CLI", subdir = "mindy-r")
```

#### Step B: Install the CLI
Currently, the CLI is installed from source (local installation).

```bash
# 1. Clone the repository
git clone https://github.com/MING-CHUNLee/MindyRtd-CLI.git
cd MindyRtd-CLI/cli

# 2. Install dependencies & build
npm install
npm run build

# 3. Link globally
npm link
```

Now you can use the command `mindy-cli` or the alias `mrc` from anywhere.

### 3. Configuration (Required for LLM)

To use the intelligent features (context building & analysis), you need to configure your LLM provider.

1. Create a `.env` file in the directory where you run the CLI (or in the CLI installation folder).
2. Add your API keys:

```env
# Example .env file

# Provider: openai, anthropic, azure, or ollama
LLM_PROVIDER=openai

# API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Optional: Custom Model
LLM_MODEL=gpt-4-turbo
```

### 4. ⚡ Quick Start (The "Active Session" Workflow)

To execute code or analyze the current project, you must connect the CLI to RStudio.

**1️⃣ In RStudio Console:**
Start the listener service. This allows RStudio to receive commands from the CLI.

```r
mindy::start()
```

**2️⃣ In Terminal:**
Run any Mindy command. For example, to scan your project:

```bash
mrc scan
```

---

## 📖 Command Reference

### `scan` - Analyze File Structure
Scans the current directory for R-related files (`.R`, `.Rmd`, `.Rproj`, etc.).

```bash
mrc scan
mrc scan --json            # Output as JSON
mrc scan --no-recursive    # Top-level only
```

### `library` - Inspect Installed Packages
Connects to R to list installed packages. **Requires `mindy::start()`**.

```bash
mrc library
mrc library --filter dplyr # Search for specific package
mrc library --json
```

### `context` - Generate LLM Context
Builds a comprehensive system prompt combining file structure + installed packages. Useful for pasting into ChatGPT/Claude.

```bash
mrc context
mrc context --copy         # Copy to clipboard
```

### `run` - Execute Code in RStudio
Directly executes R code or files in your active RStudio session. **Requires `mindy::start()`**.

```bash
# Run the file currently open in RStudio editor
mrc run

# Run a specific file
mrc run analysis.R

# Execute inline code
mrc run "head(mtcars)"

# Render an RMarkdown file
mrc run report.Rmd
```

---

## 🛠️ Developer Guide

### Architecture Overview

Mindy CLI uses a **File-Based Bridge** pattern to communicate with RStudio:

1. **CLI** writes a command to `~/.mindy/commands/pending.json`.
2. **R Package (`mindy`)** runs a background loop (via `later` package) checking for this file.
3. **R Studio** executes the command via `rstudioapi` and writes the result back.
4. **CLI** reads the result and displays it.

### Setup for Development

```bash
# Install dependencies
npm install

# Watch mode (auto-rebuild on change)
npm run dev

# Run tests
npm test
```

### Project Structure

- `src/commands/` - CLI command definitions & handlers
- `src/services/` - Business logic (File scanning, R-Bridge, Context building)
- `src/config/` - Environment configuration
- `src/types/` - TypeScript definitions

### Testing

We use **Vitest** for unit testing.

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage
```

---

## License

MIT
