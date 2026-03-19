# mindy

RStudio Bridge for Mindy CLI - Execute R code in your RStudio session via command line.

## How It Works

```
┌─────────────────────────────────────────┐
│           RStudio                        │
│                                          │
│  1. Run: mindy::start()                  │
│         ↓                                │
│  2. Listener watches ~/.mindy/commands/  │
│         ↓                                │
│  3. Executes code via sendToConsole()    │
│                                          │
└─────────────────────────────────────────┘
                    ▲
                    │ file-based
                    │ communication
                    ▼
┌─────────────────────────────────────────┐
│           Terminal                       │
│                                          │
│  $ mindy run                             │
│    → runs current file in RStudio        │
│                                          │
│  $ mindy run "1+1"                       │
│    → executes code in RStudio console    │
│                                          │
└─────────────────────────────────────────┘
```

## Installation

```r
# Install dependencies
install.packages(c("jsonlite", "later", "uuid"))

# Install from local source
install.packages("path/to/mindy-r", repos = NULL, type = "source")
```

## Quick Start

### Step 1: Start the Listener in RStudio

```r
library(mindy)
mindy::start()
```

You'll see:
```
Mindy listener started
Watching: ~/.mindy/commands
Use mindy::stop() to stop
```

### Step 2: Run from Terminal

```bash
# Run the current file open in RStudio (most common use case)
mindy run

# Run specific R code
mindy run "summary(mtcars)"

# Run a specific R file
mindy run script.R
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `mindy run` | Run the current file open in RStudio |
| `mindy run "code"` | Execute R code |
| `mindy run file.R` | Execute an R file |
| `mindy run --yes` | Skip confirmation prompt |
| `mindy run --timeout 60000` | Set timeout (ms) |

## R Functions

| Function | Description |
|----------|-------------|
| `mindy::start()` | Start the listener |
| `mindy::stop()` | Stop the listener |
| `mindy::status()` | Show listener status |

## RStudio Addins

The package also provides RStudio Addins:

- **Start Mindy** - Start the listener
- **Stop Mindy** - Stop the listener
- **Mindy Status** - Show status

Access via: RStudio menu → Addins → Mindy

## How Communication Works

1. CLI writes command to `~/.mindy/commands/pending.json`
2. R listener detects the file (polling every 0.5s)
3. R executes the command via `rstudioapi::sendToConsole()`
4. R writes result to `~/.mindy/commands/result.json`
5. CLI reads the result and displays it

## License

MIT
