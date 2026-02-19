# CLI Structure Diagram

Visual reference for the MindyCLI architecture.

## High-Level Overview

```
┌─────────────────────────────────────────────────────────┐
│                     MindyCLI                             │
├─────────────────────────────────────────────────────────┤
│  User Input (CLI Commands)                              │
│         ↓                                                │
│  ┌─────────────────────────────────────────────┐        │
│  │  Controller Layer                           │        │
│  │  • commands/ (CLI handlers)                 │        │
│  │  • controllers/ (API gateways)              │        │
│  └─────────────────────────────────────────────┘        │
│         ↓                                                │
│  ┌─────────────────────────────────────────────┐        │
│  │  Model Layer                                │        │
│  │  • services/ (business logic)               │        │
│  │  • types/ (data structures)                 │        │
│  └─────────────────────────────────────────────┘        │
│         ↓                                                │
│  ┌─────────────────────────────────────────────┐        │
│  │  View Layer                                 │        │
│  │  • views/ (output formatting)               │        │
│  │  • templates/ (prompts, i18n)               │        │
│  └─────────────────────────────────────────────┘        │
│         ↓                                                │
│  Console Output                                          │
└─────────────────────────────────────────────────────────┘
```

## Detailed Layer Interaction

```
┌─────────────────────────────────────────────────────────────────────┐
│                          User Types Command                          │
│                    $ mindycli scan --recursive                       │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  index.ts (Entry Point)                                              │
│  • Loads Commander.js                                                │
│  • Registers commands                                                │
│  • Parses argv                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  commands/scan.ts (Command Handler)                                  │
│  • Validates options                                                 │
│  • Calls fileScanner.scan()         ←─────┐                          │
│  • Calls displayScanResult()              │                          │
└───────────────────────────────────────────┼───────────────────────────┘
                                            │
                    ┌───────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│  services/file-scanner.ts (Business Logic)                           │
│  • Reads directory recursively                                       │
│  • Categorizes files by type                                         │
│  • Returns ScanResult                  ←────┐                        │
└────────────────────────────────────────────┼─────────────────────────┘
                                              │
                          ┌───────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────────┐
│  types/scan-result.ts (Data Structure)                               │
│  • Defines ScanResult interface                                      │
│  • Defines FileInfo interface                                        │
│  • createScanResult() factory                                        │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  views/scan-result.ts (Output Formatting)                            │
│  • Formats ScanResult for console                                    │
│  • Uses chalk for colors                                             │
│  • Displays file counts and paths                                    │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                          Console Output                              │
│  Scan Results:                                                       │
│  ✓ R Scripts: 15                                                     │
│  ✓ RMarkdown: 3                                                      │
│  ✓ Data files: 7                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Dependency Graph

```
┌──────────────────────────────────────────────────────────────────┐
│                        Dependency Flow                            │
└──────────────────────────────────────────────────────────────────┘

index.ts
  │
  ├─→ commands/scan.ts
  │     ├─→ services/file-scanner.ts
  │     │     ├─→ types/scan-result.ts
  │     │     └─→ utils/errors.ts
  │     │
  │     └─→ views/scan-result.ts
  │           └─→ types/scan-result.ts
  │
  ├─→ commands/library.ts
  │     ├─→ services/library-scanner.ts
  │     │     ├─→ types/library-info.ts
  │     │     └─→ utils/errors.ts
  │     │
  │     └─→ views/library-result.ts
  │           └─→ types/library-info.ts
  │
  └─→ commands/context.ts
        ├─→ services/context-builder.ts
        │     ├─→ templates/prompts/section-builders.ts
        │     │     └─→ types/prompt-context.ts
        │     │
        │     └─→ types/project-info.ts
        │
        └─→ views/banner.ts
```

## External API Integration Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    User Request (e.g., analyze)                      │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  commands/analyze.ts                                                 │
│  • Gets file content from services/file-scanner.ts                   │
│  • Calls llmController.analyze()                                     │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  controllers/llm-controller.ts (API Gateway)                         │
│  • Reads config/index.ts for API keys                                │
│  • Chooses provider (OpenAI, Anthropic, Azure, Ollama)               │
│  • Sends HTTP request to LLM API                                     │
│  • Returns parsed response                                           │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
                          External LLM API
                    (Claude, GPT-4, Azure OpenAI, Ollama)
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  Response flows back through controller                              │
│  → Service processes response                                        │
│  → View formats output                                               │
│  → Display to user                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Prompt Generation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  services/context-builder.ts                                         │
│  • buildContext(projectInfo, scanResult, libraryInfo)                │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  templates/prompts/section-builders.ts                               │
│  • buildProjectSection(projectInfo)                                  │
│  • buildFilesSection(scanResult)                                     │
│  • buildLibrariesSection(libraryInfo)                                │
│  • buildEnvironmentSection(envInfo)                                  │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  templates/locale-loader.ts (i18n)                                   │
│  • Loads templates/locales/en.json or zh-TW.json                     │
│  • Translates section headers and labels                             │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  Final System Prompt (Markdown formatted)                            │
│                                                                       │
│  # Project Context                                                   │
│  - Name: MyProject                                                   │
│  - R Version: 4.3.0                                                  │
│                                                                       │
│  # Files                                                             │
│  - R Scripts: 15 files                                               │
│  - RMarkdown: 3 files                                                │
│                                                                       │
│  # Libraries                                                         │
│  - dplyr (1.1.0) → Data manipulation                                 │
│  - ggplot2 (3.4.0) → Data visualization                              │
└─────────────────────────────────────────────────────────────────────┘
```

## Configuration Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  Environment Variables (.env)                                        │
│  • LLM_PROVIDER=anthropic                                            │
│  • ANTHROPIC_API_KEY=sk-ant-xxxxx                                    │
│  • LLM_MODEL=claude-sonnet-4                                         │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  config/index.ts                                                     │
│  • Loads env vars with dotenv                                        │
│  • Provides defaults                                                 │
│  • Exports config object                                             │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  controllers/llm-controller.ts                                       │
│  • Reads config.llm.provider                                         │
│  • Reads config.llm.apiKey                                           │
│  • Reads config.llm.model                                            │
└─────────────────────────────────────────────────────────────────────┘
```

## Testing Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  tests/                                                              │
│  ├─ file-scanner.test.ts                                             │
│  │    • Mocks fs module                                              │
│  │    • Tests scan() function                                        │
│  │    • Verifies ScanResult structure                                │
│  │                                                                    │
│  ├─ library-scanner.test.ts                                          │
│  │    • Mocks child_process                                          │
│  │    • Tests R package detection                                    │
│  │    • Verifies LibraryInfo structure                               │
│  │                                                                    │
│  ├─ types.test.ts                                                    │
│  │    • Tests factory functions                                      │
│  │    • Validates type definitions                                   │
│  │                                                                    │
│  └─ errors.test.ts                                                   │
│       • Tests custom error classes                                   │
│       • Validates error messages                                     │
└─────────────────────────────────────────────────────────────────────┘

Vitest Configuration:
• Framework: Vitest
• Coverage: c8
• Mocking: vi.fn(), vi.mock()
```

## Summary

This architecture provides:

1. **Clear separation**: Controllers, Models, Views, Infrastructure
2. **Testability**: Each layer can be tested independently
3. **Maintainability**: Easy to find and modify code
4. **Scalability**: Easy to add new commands and services
5. **Cross-platform**: Works on Windows, macOS, Linux

Each component has a single responsibility and dependencies flow in one direction (top to bottom, never circular).
