# Code Review Skill

A systematic skill for conducting code reviews on this project.

## Overview

This skill provides a structured approach for reviewing code changes in the MindyCLI project. It ensures consistency, quality, and adherence to project standards.

## When to Use

- Before merging any pull request
- After completing a feature implementation
- When refactoring existing code
- During periodic codebase audits

## Review Process

### Step 1: Understand the Change

1. Read the commit message or PR description
2. Identify the files changed
3. Understand the purpose of the change

### Step 2: Architecture Review

Check if the change follows the **MVC-inspired CLI Architecture**:

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

**Layer Responsibilities:**

| Layer | Directories | Responsibility |
|-------|-------------|----------------|
| **Controller** | `commands/`, `controllers/` | User interaction, API communication |
| **Model** | `services/`, `types/` | Business logic, data structures |
| **View** | `views/`, `templates/` | Output formatting, prompt generation |
| **Infrastructure** | `config/`, `data/`, `utils/` | Cross-cutting concerns |

**Architecture Questions:**
- [ ] Is the code in the correct directory for its responsibility?
- [ ] Commands only handle CLI interaction (parsing args, calling services)?
- [ ] Controllers only handle external API communication?
- [ ] Services contain reusable business logic (no I/O dependencies)?
- [ ] Views only handle output formatting (no business logic)?
- [ ] Types are properly defined and exported from `types/index.ts`?
- [ ] Config uses environment variables following 12-Factor App?
- [ ] Tests exist in `tests/` directory with `.test.ts` suffix?

**Cross-Platform Considerations:**
- [ ] Does the code handle Windows, macOS, and Linux paths correctly?
- [ ] Are platform-specific paths using `process.platform` detection?
- [ ] Is `path.join()` used instead of hardcoded path separators?
- [ ] Are executable names platform-aware (e.g., `.exe` on Windows)?

**Dependency Flow:**
```
commands/ ──→ services/ ──→ types/
    │              │
    └──→ views/    └──→ utils/
    │
controllers/ ──→ config/
```

**Note:** This architecture is a **pragmatic MVC adaptation** for CLI tools:
- ✅ Clear separation of concerns (Controller/Model/View)
- ✅ `controllers/` for external API gateways (not traditional MVC controllers)
- ✅ `services/` as business logic layer (orchestrates multiple operations)
- ✅ `templates/` for i18n and prompt generation (View helper)
- ✅ Factory functions (`createXxx`) for entity construction
- ✅ Tests use Vitest framework

### Step 3: Code Quality Review

Apply the appropriate sub-skill based on language:
- TypeScript/JavaScript → Use `typescript-clean-code/SKILL.md`
- Ruby → Use Ruby style guide (future skill)

### Step 4: Testing Review

- [ ] Are there tests for the new functionality?
- [ ] Do existing tests still pass? (`npm test` in `cli/`)
- [ ] Is test coverage adequate?
- [ ] Are tests cross-platform compatible? (use `toContain()` instead of exact path matching)
- [ ] Are mocks properly set up for external dependencies (fs, child_process)?

### Step 5: Documentation Review

- [ ] Is the code self-documenting?
- [ ] Are public APIs documented with JSDoc?
- [ ] Is `IMPLEMENTATION_PLAN.md` updated if needed?
- [ ] Are directives updated if behavior changed?

## Output Format

After review, produce a report in this format:

```markdown
## Code Review Report

**Date:** YYYY-MM-DD
**Reviewer:** [Name/Agent]
**Files Reviewed:** [List of files]

### Summary
[Brief overview of changes]

### Findings

#### ✅ Strengths
- [What was done well]

#### ⚠️ Suggestions
- [Optional improvements]

#### ❌ Issues (Must Fix)
- [Critical problems]

### Verdict
- [ ] Approved
- [ ] Approved with suggestions
- [ ] Needs changes
```

## Integration with Other Skills

| Skill | When to Use |
|-------|-------------|
| `typescript-clean-code` | For TS/JS code quality |
| (future) `ruby-clean-code` | For Ruby API code |
| (future) `testing` | For test quality |

## Example Usage

### Example 1: Reviewing a Service File

```
Agent: I need to review the library-scanner.ts file.

1. Check architecture compliance ✓ (in services/)
2. Apply typescript-clean-code skill ✓
3. Cross-platform check ✓ (uses PLATFORM detection, path.join())
4. Verify tests exist ✓ (library-scanner.test.ts)
5. Check documentation ✓

Result: Approved.
```

### Example 2: Reviewing a New Command

```
Agent: I need to review the new library.ts command.

1. Check architecture compliance ✓ (in commands/)
2. Business logic delegated to service? ✓ (uses library-scanner.ts)
3. View used for output? ✓ (uses library-result.ts)
4. Types properly imported? ✓ (from types/library-info.ts)
5. Tests exist? ⚠️ (command tests not yet implemented)

Result: Approved with suggestion to add command tests.
```
