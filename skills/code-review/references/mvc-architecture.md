# MVC Architecture Reference

## Overview

The MindyCLI project follows a **pragmatic MVC-inspired architecture** adapted for CLI tools. This architecture ensures clear separation of concerns while remaining practical for command-line applications.

## Full Architecture Diagram

```
cli/
├── src/
│   ├── index.ts              # Entry point (Commander.js setup)
│   │
│   ├── commands/             # [Controller Layer] CLI command handlers
│   │   ├── scan.ts           # File scanning command
│   │   ├── library.ts        # R library scanning command
│   │   └── context.ts        # Context/prompt preview command
│   │
│   ├── controllers/          # [Controller Layer] External API communication
│   │   ├── index.ts          # Controller exports
│   │   └── llm-controller.ts # LLM API gateway (OpenAI, Anthropic, Azure, Ollama)
│   │
│   ├── services/             # [Model Layer] Business logic & orchestration
│   │   ├── file-scanner.ts   # File detection & scanning
│   │   ├── library-scanner.ts # R package/library scanning (cross-platform)
│   │   ├── context-builder.ts # System prompt generation orchestrator
│   │   └── r-environment-service.ts # R environment health checks & facade
│   │
│   ├── types/                # [Model Layer] TypeScript type definitions
│   │   ├── index.ts          # Main exports (barrel file)
│   │   ├── file-info.ts      # FileInfo entity
│   │   ├── project-info.ts   # ProjectInfo entity
│   │   ├── scan-result.ts    # ScanResult data structure
│   │   ├── library-info.ts   # LibraryInfo & package types
│   │   ├── environment.ts    # R environment types
│   │   └── prompt-context.ts # Context builder types
│   │
│   ├── views/                # [View Layer] Output formatting & display
│   │   ├── index.ts          # View exports
│   │   ├── banner.ts         # CLI banner display
│   │   ├── scan-result.ts    # File scan result display
│   │   ├── library-result.ts # Library scan result display
│   │   └── environment-result.ts # Environment report display
│   │
│   ├── config/               # [Infrastructure] Configuration management
│   │   └── index.ts          # Env vars, LLM config (12-Factor App pattern)
│   │
│   ├── templates/            # [Infrastructure] Prompt templates & i18n
│   │   ├── index.ts          # Template exports
│   │   ├── locale-loader.ts  # i18n loader (i18next pattern)
│   │   ├── locales/          # Language JSON files (en.json, zh-TW.json)
│   │   └── prompts/
│   │       ├── index.ts      # Prompt template exports
│   │       └── section-builders.ts # Pure functions for prompt sections
│   │
│   ├── data/                 # [Infrastructure] Static data
│   │   └── package-capabilities.ts # R package → capability mapping
│   │
│   └── utils/                # [Shared] Helper functions
│       ├── errors.ts         # Custom error classes (DomainError pattern)
│       └── format.ts         # Formatting utilities
│
└── tests/                    # Unit tests (Vitest)
    ├── types.test.ts         # Type definition tests
    ├── errors.test.ts        # Error class tests
    ├── file-scanner.test.ts  # File scanner tests
    ├── library-info.test.ts  # Library info type tests
    └── library-scanner.test.ts # Library scanner tests
```

## Layer Responsibilities

### Controller Layer (`commands/`, `controllers/`)

**Purpose:** Handle user interaction and external API communication

**Responsibilities:**
- Parse command-line arguments (Commander.js)
- Validate user input
- Call appropriate services
- Communicate with external APIs (LLM providers)
- Handle HTTP requests/responses

**What NOT to put here:**
- Business logic
- Data transformation
- File system operations
- Complex calculations

**Example:**
```typescript
// commands/scan.ts
export const scanCommand = new Command('scan')
  .description('Scan R project files')
  .option('-r, --recursive', 'Scan recursively')
  .action(async (options) => {
    const result = await fileScanner.scan(options); // Delegate to service
    displayScanResult(result); // Delegate to view
  });
```

### Model Layer (`services/`, `types/`)

**Purpose:** Contain business logic and data structures

**Services Responsibilities:**
- Orchestrate multiple operations
- Implement business rules
- Coordinate between different domains
- Transform and validate data

**Types Responsibilities:**
- Define data structures (interfaces, types)
- Define entity shapes
- Type safety across the application

**What NOT to put here:**
- I/O operations (file reading, API calls) - use infrastructure layer
- Output formatting - use view layer
- CLI-specific logic - use controller layer

**Example:**
```typescript
// services/library-scanner.ts
export class LibraryScanner {
  scan(projectPath: string): LibraryInfo[] {
    // Pure business logic
    const packages = this.detectPackages(projectPath);
    return packages.map(pkg => this.enrichWithCapabilities(pkg));
  }
}

// types/library-info.ts
export interface LibraryInfo {
  name: string;
  version: string;
  capabilities: string[];
}
```

### View Layer (`views/`, `templates/`)

**Purpose:** Format and display output

**Responsibilities:**
- Format data for console output
- Generate prompt templates
- Handle internationalization (i18n)
- Create visual representations (tables, banners)

**What NOT to put here:**
- Business logic
- Data fetching
- Data transformation (beyond formatting)

**Example:**
```typescript
// views/scan-result.ts
export function displayScanResult(result: ScanResult): void {
  console.log(chalk.bold('\nScan Results:'));
  console.log(`R Scripts: ${result.files.rScripts.length}`);
  // ... formatting only
}

// templates/prompts/section-builders.ts
export function buildProjectSection(project: ProjectInfo): string {
  return `Project: ${project.name}\nVersion: ${project.version}`;
}
```

### Infrastructure Layer (`config/`, `data/`, `utils/`)

**Purpose:** Handle cross-cutting concerns and external systems

**Responsibilities:**
- Configuration management (environment variables)
- Static data storage
- Utility functions
- Error handling classes
- External service integrations

**What NOT to put here:**
- Business logic specific to a feature
- View formatting
- Command handlers

**Example:**
```typescript
// config/index.ts
export const config = {
  llm: {
    provider: process.env.LLM_PROVIDER || 'anthropic',
    model: process.env.LLM_MODEL || 'claude-sonnet-4',
  },
};

// utils/errors.ts
export class DirectoryNotFoundError extends Error {
  constructor(path: string) {
    super(`Directory not found: ${path}`);
    this.name = 'DirectoryNotFoundError';
  }
}
```

## Dependency Flow

```
commands/ ──→ services/ ──→ types/
    │              │
    └──→ views/    └──→ utils/
    │
controllers/ ──→ config/
```

**Rules:**
1. **Commands** can depend on: services, views, types
2. **Controllers** can depend on: config, types
3. **Services** can depend on: types, utils (NOT views, NOT commands)
4. **Views** can depend on: types, utils (NOT services, NOT commands)
5. **Types** should have NO dependencies (pure definitions)
6. **Utils** can depend on: types only

## Key Architectural Decisions

### 1. Why separate `commands/` and `controllers/`?

- **`commands/`**: Handle CLI-specific interactions (parsing arguments, calling services)
- **`controllers/`**: Handle external API communications (HTTP, gRPC, etc.)
- This separation keeps CLI concerns separate from API gateway logic

### 2. Why `services/` instead of traditional model?

- Services orchestrate multiple operations
- They contain reusable business logic
- They coordinate between different domains
- More appropriate for CLI tools than traditional MVC "models"

### 3. Why `templates/` in infrastructure?

- Templates (especially prompts) are more like "data" than "view logic"
- i18n is a cross-cutting concern
- Separating templates from views keeps views focused on formatting

### 4. Factory Functions vs Classes

We use **factory functions** (`createXxx`) for entity construction:

```typescript
// types/file-info.ts
export function createFileInfo(path: string, type: FileType): FileInfo {
  return {
    path,
    type,
    size: fs.statSync(path).size,
    modifiedAt: fs.statSync(path).mtime,
  };
}
```

**Why?**
- Simpler than class constructors
- Easier to test and mock
- More functional programming style
- No `this` binding issues

## Testing Strategy

Tests live in `tests/` directory with `.test.ts` suffix:

- **Unit tests**: Test individual functions/classes in isolation
- **Integration tests**: Test how components work together
- **Use Vitest framework** for all tests
- **Mock external dependencies** (fs, child_process, API calls)

## Summary

This architecture provides:
- ✅ Clear separation of concerns (Controller/Model/View)
- ✅ `controllers/` for external API gateways
- ✅ `services/` as business logic layer
- ✅ `templates/` for i18n and prompt generation
- ✅ Factory functions for entity construction
- ✅ Testable, maintainable codebase
