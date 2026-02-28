# Usage Guide

## ⚡ Quick Start (The "Active Session" Workflow)

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

### `install` - Package Installation
Installs R packages with multi-layered safety checks (CRAN status, trust metrics, dependencies, etc.) in your active RStudio session. **Requires `mindy::start()`**.

```bash
# Install a package from CRAN
mrc install dplyr

# Install multiple packages
mrc install dplyr ggplot2

# Install from GitHub
mrc install tidyverse/dplyr --source github

# Skip confirmation prompt
mrc install dplyr --yes
```

### `agent` - AI-Powered File Editor
Runs the autonomous Agent workflow to edit project files based on natural language instructions.

```bash
# Ask the agent to perform a coding task
mrc agent "Add error handling to the data loading functions"

# Specify a directory
mrc agent "Add comments to logger" -d ./src
```
The agent operates in three phases: resolving relevant files from the workspace, generating modifications via LLM, and presenting a diff review for interactive confirmation.

### `tui` - Interactive Mode
Launches the interactive Terminal User Interface. Equivalent to running `mrc` without arguments.

```bash
mrc tui
```
