# CLI Architecture Reference

Full architecture details for use during Step 2 of the code-review skill.

## Skill Orchestration

This `code-review` skill is the top-level orchestrator across four review layers:

- **Layer 1 – Architecture Review:** file structure, MVC compliance, dependencies
- **Layer 2 – Code Quality Review:** delegates to `typescript-clean-code` skill
- **Layer 3 – Testing Review:** coverage, cross-platform compatibility
- **Layer 4 – Documentation Review:** JSDoc, IMPLEMENTATION_PLAN, directives

## Full Directory Structure

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
│   │   ├── library-scanner.ts            # R package/library scanning (cross-platform)
│   │   ├── context-builder.ts            # System prompt generation orchestrator
│   │   └── r-environment-service.ts      # R environment health checks & facade
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
│   │   └── environment-result.ts         # Environment report display
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
│   │       └── section-builders.ts       # Pure functions for prompt sections
│   │
│   ├── data/                 # [Infrastructure] Static data
│   │   └── package-capabilities.ts       # R package → capability mapping
│   │
│   └── utils/                # [Shared] Helper functions
│       ├── errors.ts         # Custom error classes (DomainError pattern)
│       └── format.ts         # Formatting utilities
│
└── tests/                    # Unit tests (Vitest)
    ├── types.test.ts
    ├── errors.test.ts
    ├── file-scanner.test.ts
    ├── library-info.test.ts
    └── library-scanner.test.ts
```

## Dependency Flow

```
commands/ ──→ services/ ──→ types/
    │              │
    └──→ views/    └──→ utils/
    │
controllers/ ──→ config/
```

## Architecture Design Notes

This is a pragmatic MVC adaptation for CLI tools:

- `controllers/` acts as an external API gateway (not a traditional MVC controller)
- `services/` is the business logic layer, orchestrating multiple operations
- `templates/` serves as a View helper for i18n and prompt generation
- Factory functions (`createXxx`) are used for entity construction
- Test framework: Vitest
