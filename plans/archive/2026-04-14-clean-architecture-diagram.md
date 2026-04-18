# Plan: Clean Architecture System Diagram

**Date:** 2026-04-14  
**Scope:** Draw a layer-by-layer architecture diagram (similar to the Clean Architecture reference image) that accurately reflects the *real* import and call relationships in `cli/src/`.

---

## Goal

Produce a `.drawio` diagram that visually mirrors the reference image layout:

| Row | Layer |
|-----|-------|
| Top | Presentation (new) |
| 2nd | Composition (bridge) |
| 3rd | Application (modify) |
| 4th | Domain Model (unchanged) |
| Bottom | Infrastructure (unchanged) |

Every arrow in the diagram must correspond to a real `import` statement or runtime call in the source. No invented arrows.

> **注意：** 實際 `cli/src/` 共有 **六個** 頂層模組：`presentation/`, `composition/`, `application/`, `domain/`, `infrastructure/`, `shared/`。`composition/` 是一個獨立資料夾（不在 infrastructure 下），用來隔離 Presentation 與 Infrastructure 之間的互相 import。

---

## Diagram Tool

Use **draw.io** (`.drawio` XML format).  
Output file: `plans/2026-04-14-clean-architecture-diagram.drawio`

The existing `plans/2026-04-14-cli-tui-entrypoints-callflow.drawio` may be used as a style reference.

---

## Layer Contents (real files only)

### Entry Point — `src/index.ts`

Draw as a standalone box **above** all layers (the process entry).

**Real imports in `index.ts`:**
- `presentation/cli/agent-cli-adapter` → `createAgentCommand`
- `presentation/cli/ask-cli-adapter` → `createAskCommand`
- `presentation/cli/knowledge-cli-adapter` → `knowledgeCommand`
- `presentation/views/banner` → `displayBanner`
- `infrastructure/config/settings` → `getSettings`
- `composition/create-agent-controller` → `createAgentController`

---

### Layer 1 — Presentation

Corresponds to "Representation" in the reference image (top row, blue).

**Boxes to draw:**

| Box Label | Source File |
|-----------|-------------|
| CLI Adapters | `presentation/cli/agent-cli-adapter.ts`<br>`presentation/cli/ask-cli-adapter.ts`<br>`presentation/cli/knowledge-cli-adapter.ts`<br>`presentation/cli/rollback-cli-adapter.ts` |
| TUI Container | `presentation/tui/index.tsx`<br>`presentation/tui/App.tsx`<br>`presentation/tui/AppController.tsx` |
| TUI Components | `components/ChatHistory.tsx`<br>`components/DiffReview.tsx`<br>`components/Header.tsx`<br>`components/Footer.tsx`<br>`components/StatusBar.tsx`<br>`components/StreamingMessage.tsx`<br>`components/ThinkingIndicator.tsx`<br>`components/InstallReview.tsx`<br>`components/LibraryResultCard.tsx`<br>`components/RExecResultCard.tsx`<br>`components/RInstallResultCard.tsx`<br>`components/ScanResultCard.tsx` |
| Event Mapper | `presentation/tui/event-mapper.ts` |
| Views | `presentation/views/banner.ts`<br>`presentation/views/context-status-bar.ts`<br>`presentation/views/scan-result.ts`<br>`presentation/views/library-result.ts` |
| ViewModels | `presentation/view-models/index.ts` |
| i18n (presentation) | `presentation/i18n/index.ts` |

**Arrows out of Presentation (real imports):**
- CLI Adapters → `composition/create-agent-controller` *(createController callback 由 index.ts 注入)*
- AppController.tsx → Event Mapper *(imports `event-mapper.ts`)*
- AppController.tsx → TUI Components *(App.tsx renders all components)*
- Event Mapper → `AgentEvent` type *(defined in `application/controllers/agent-controller.ts`)*

---

### Layer 1.5 — Composition (橋接層)

**This is a real, standalone top-level folder: `src/composition/`**

| Box Label | Source File |
|-----------|-------------|
| **createAgentController** | `composition/create-agent-controller.ts` |

**Purpose:** The only module allowed to import from both `application/` and `infrastructure/` simultaneously. Enforces that `presentation/` never directly imports `infrastructure/`.

**Real imports inside `create-agent-controller.ts`:**
- `application/controllers/agent-controller` → `AgentController`, `AgentEvent`, `ProposedEdit`, `ProposedInstall`
- `infrastructure/bootstrap/agent-factory` → `buildAgentDeps`

**Arrows:**
- `index.ts` → `createAgentController` *(imports and calls it)*
- CLI Adapters receive `createController` callback → resolves to `createAgentController`
- `createAgentController` → `AgentController` *(application layer)*
- `createAgentController` → `buildAgentDeps` *(infrastructure layer)*

---

### Layer 2 — Application

Corresponds to "Application" in the reference image (red, central row).

Sub-components (draw as grouped boxes inside this layer):

| Sub-component | Source Files |
|---------------|--------------|
| **AgentController** | `application/controllers/agent-controller.ts` |
| **Use Cases** | `execute-ask-use-case.ts`<br>`execute-instruction-use-case.ts`<br>`execute-run-use-case.ts`<br>`execute-solver-use-case.ts`<br>`execute-tutor-use-case.ts`<br>`execute-install-use-case.ts` |
| **Services** | `event-bus.ts`, `intent-router.ts`, `history-summarizer.ts`<br>`diff-engine.ts`, `edit-staging-service.ts`<br>`mode-manager.ts`, `slash-command-router.ts`<br>`context-builder.ts`, `knowledge-base.ts`<br>`evaluator.ts` ← **Evaluator service** (validates + retries LLM edit output)<br>`code-confirmer.ts`, `file-read-service.ts` |
| **Tools** | `file-scan-tool.ts`, `file-read-tool.ts`, `file-edit-tool.ts`<br>`pdf-read-tool.ts`, `r-exec-tool.ts`, `r-install-tool.ts`<br>`r-render-tool.ts`, `library-scan-tool.ts` |
| **Tool Registry** | `application/orchestration/tool-registry.ts` |
| **Orchestrator / ReAct Loop** | `application/orchestration/orchestrator.ts`<br>`application/orchestration/react-loop.ts`<br>`application/services/react-loop.ts` |
| **Prompts** | `application/prompts/` (index, intent-classifier, instruction-agent, evaluator, etc.) |
| **Ports (interfaces)** | `application/ports/r-bridge-port.ts` |

**Internal Application arrows (real imports):**
- AgentController → Use Cases *(instantiates each Execute*UseCase)*
- AgentController → Services: IntentRouter, HistorySummarizer, ModeManager, SlashCommandRouter, EventBus
- Use Cases → ToolRegistry *(registry.get / registry.execute)*
- Use Cases → Orchestrator *(ExecuteInstructionUseCase → Orchestrator)*
- Orchestrator → ReactLoop
- Orchestrator → ToolRegistry
- Services (IntentRouter, HistorySummarizer) → Prompts *(intent-classifier.ts, summarizer.ts)*
- Use Cases / Services → Prompts *(instruction-agent, evaluator, decomposer)*
- **Evaluator service** → `Prompts/evaluator` *(imports `JSON_FORMATTER_SYSTEM_PROMPT`)*
- **Evaluator service** → `LLMGateway` *(calls `llm.sendPrompt()` for retry correction)*
- **Evaluator service** → `shared/utils/json-extractor` *(calls `extractJsonArray()`)*
- ExecuteInstructionUseCase → Evaluator service *(post-ReAct edit validation)*

**Arrows into Domain:**
- Use Cases → `LLMGateway` interface *(domain/types/llm-gateway.ts)*
- Use Cases → `AgentTool` interface *(domain/types/agent-tool.ts)*
- Tools → `IFileSystem` interface *(domain/types/file-system.ts)*
- Tools → `IRScriptRunner` interface *(domain/types/r-script-runner.ts)*
- AgentController → `SessionStore` interface *(domain/repositories/session-store.ts)*
- AgentController → `ConversationSession` entity *(domain/entities/conversation-session.ts)*

---

### Layer 3 — Domain Model

Corresponds to "Domain Model" in the reference image (grey, unchanged layer).

Sub-components:

| Sub-component | Source Files |
|---------------|-------------|
| **Entities (Aggregate Roots)** | `ConversationSession` — `domain/entities/conversation-session.ts`<br>`ConversationTurn` — `domain/entities/conversation-turn.ts`<br>`FileChange` — `domain/entities/file-change.ts`<br>`KnowledgeEntry` — `domain/entities/knowledge-entry.ts` |
| **Value Objects** | `TokenBudget`, `CacheStatus`, `EnvironmentContext`, `LlmOutput`, `FileInfo`, `LibraryInfo`, `ProjectInfo`, `ScanResult` — all in `domain/values/` |
| **Interfaces (Ports)** | `LLMGateway` — `domain/types/llm-gateway.ts`<br>`AgentTool` — `domain/types/agent-tool.ts`<br>`IFileSystem` — `domain/types/file-system.ts`<br>`IDirectoryScanner` — `domain/types/directory-scanner.ts`<br>`IRScriptRunner` — `domain/types/r-script-runner.ts` |
| **Repository Interfaces** | `SessionStore` — `domain/repositories/session-store.ts` |
| **Policies** | `AgentFilePolicy` — `domain/policies/agent-file-policy.ts` |
| **Domain Libraries** | `model-limits.ts`, `token-pricing.ts` in `domain/lib/` |

**Arrows out of Domain:** None (domain has no outbound dependencies by design).

---

### Layer 4 — Infrastructure

Corresponds to "Infrastructure" in the reference image (grey, bottom, unchanged layer).

Sub-components:

| Sub-component | Source Files |
|---------------|-------------|
| **LLM Gateway** *(implements LLMGateway)* | `infrastructure/api/llm/gateway/llm-gateway.ts`<br>`infrastructure/api/llm/mapper/llm-mapper.ts` |
| **Session Repository** *(implements SessionStore)* | `infrastructure/persistence/session-repository.ts` |
| **Knowledge Repository** | `infrastructure/persistence/knowledge-repository.ts` |
| **Local File System** *(implements IFileSystem)* | `infrastructure/filesystem/local-file-system.ts` |
| **Directory Scanner** *(implements IDirectoryScanner)* | `infrastructure/filesystem/directory-scanner.ts`<br>`infrastructure/filesystem/file-scanner.ts` |
| **R Adapter** *(implements IRScriptRunner, RBridgePort)* | `infrastructure/r-adapter/r-script-runner.ts`<br>`infrastructure/r-adapter/r-bridge.ts`<br>`infrastructure/r-adapter/library-scanner.ts`<br>`infrastructure/r-adapter/package-installer.ts`<br>`infrastructure/r-adapter/package-validator.ts` |
| **Config / Paths** | `infrastructure/config/constants.ts`<br>`infrastructure/config/settings.ts`<br>`infrastructure/config/paths.ts` |
| **Logging** | `infrastructure/api/logging/gateway/session-log-gateway.ts` |
| **Plugin Loader** | `infrastructure/filesystem/plugin-loader.ts` |
| **Bootstrap (DI Factory)** | `infrastructure/bootstrap/agent-factory.ts` |

> `agent-factory.ts` **不再是** Composition Root — 它只負責建立 infrastructure 實例並組裝 `AgentControllerDeps`。  
> 真正的 Composition Root 是 `composition/create-agent-controller.ts`（獨立模組），負責把 factory 產出的 deps 交給 AgentController。

**Arrows from Infrastructure → Domain (implements):**
- LlmGateway → `LLMGateway` interface *(implements)*
- LocalFileSystem → `IFileSystem` interface *(implements)*
- SessionRepository → `SessionStore` interface *(implements)*
- DirectoryScanner → `IDirectoryScanner` interface *(implements)*
- RScriptRunner → `IRScriptRunner` interface *(implements)*

**Special: Bootstrap Factory arrows (agent-factory.ts):**
- agent-factory.ts → ALL infrastructure concrete classes (instantiates)
- agent-factory.ts → ALL application use cases + services (constructs with DI)
- agent-factory.ts returns `AgentControllerDeps` → consumed by `composition/create-agent-controller.ts`

---

### Cross-Layer: Shared Types

Draw as a vertical sidebar or separate zone:

| Box | Source |
|-----|--------|
| `LLMRequestPayload / LLMResponse` | `shared/types/llm-types.ts` |
| `SessionMessage` | `shared/types/messages.ts` |
| `AgentEvent` | (re-exported from controller) |
| Other utility types | `shared/types/` |
| i18n utilities | `shared/i18n/` |
| Error utilities | `shared/utils/` |

---

## Visual Style Guide

Follow the reference image style:

| Element | Style |
|---------|-------|
| Presentation layer | Light blue background, dark blue header |
| Application layer | Light red/pink background, dark red header |
| Domain layer | White/light grey, no color fill |
| Infrastructure layer | Light grey |
| "Implements" arrows (infra → domain interface) | Dashed line with open arrowhead |
| "Calls / instantiates" arrows | Solid line with filled arrowhead |
| Composition Root box | Bold border, yellow highlight (special wiring node) |
| Interface boxes | Italic label + `«interface»` stereotype label |
| Aggregate Root boxes | Bold label + `«aggregate root»` stereotype label |

Arrow labels (where space allows):
- `«implements»` for infrastructure → domain interface
- `«calls»` for use case → tool/service
- `«injects»` for factory → use cases
- `«emits»` for controller → event bus

---

## Diagram Layout Sketch

```
  [src/index.ts]  ← entry point (Commander program)
       │ imports createAgentController, createAgentCommand, createAskCommand
       ▼
┌───────────────────────────────────────────────────────────────┐
│  PRESENTATION (blue)                                           │
│  [CLI Adapters]  [TUI: index → App → AppController]           │
│  [TUI Components: ChatHistory, DiffReview, StatusBar, ...]    │
│  [Event Mapper]  [Views / ViewModels]  [i18n]                 │
└───────────┬──────────────────────────┬────────────────────────┘
            │ receives createController │ emits AgentEvent
            ▼                          │ (event-mapper → TUIMessage)
┌─────────────────────────────────────────────────────────────┐
│  COMPOSITION (orange — bridge)                               │
│  ★ [createAgentController]                                   │
│     imports AgentController (application)                    │
│     imports buildAgentDeps (infrastructure)                  │
└──────────┬──────────────────────────┬───────────────────────┘
           │ new AgentController(...)  │ buildAgentDeps(...)
           ▼                          ▼
┌──────────────────────┐   ┌────────────────────────────────────┐
│  APPLICATION (red)   │   │  INFRASTRUCTURE (grey)              │
│  [AgentController]   │   │  ★ [agent-factory.ts] ← DI wiring  │
│  [Use Cases ×6]      │   │  [LlmGateway]                      │
│  [Orchestrator]      │   │  [SessionRepository]               │
│  [ReactLoop]         │   │  [LocalFileSystem]                 │
│  [Tool Registry]     │   │  [DirectoryScanner]                │
│  [Tools ×8]          │   │  [RScriptRunner + RBridge]         │
│  [Services ×12]      │   │  [PackageInstaller/Validator]      │
│    ↳ Evaluator svc   │   │  [Config / Paths / Settings]       │
│  [Prompts ×9]        │   │  [Logging] [PluginLoader]          │
│  [Ports]             │   └────────────┬───────────────────────┘
└──────────┬───────────┘                │ «implements»
           │ depends on «interface»     │
           ▼                           ▼
┌───────────────────────────────────────────────────────────────┐
│  DOMAIN MODEL (white / grey)                                   │
│  «interfaces»:                                                 │
│  [LLMGateway] [IFileSystem] [IDirectoryScanner]               │
│  [IRScriptRunner] [SessionStore]                               │
│  «entities»:                                                   │
│  [ConversationSession] [ConversationTurn] [FileChange]        │
│  [KnowledgeEntry]                                              │
│  «values»:                                                     │
│  [TokenBudget] [CacheStatus] [ScanResult] [EnvironmentContext]│
│  «policies»: [AgentFilePolicy]                                 │
│  «lib»: [model-limits] [token-pricing]                        │
└───────────────────────────────────────────────────────────────┘

   ┊ SHARED (sidebar)       ┊
   ┊ LLMRequestPayload      ┊
   ┊ SessionMessage         ┊
   ┊ AgentEvent             ┊
   ┊ shared/types/, utils/  ┊
   ┊ shared/i18n/           ┊
```

---

## Execution Steps

1. **Open** `plans/2026-04-14-clean-architecture-diagram.drawio` in draw.io desktop or VS Code draw.io extension.
2. **Create five horizontal swim-lane rows** (Presentation, Composition, Application, Domain, Infrastructure) + 1 sidebar for Shared.
3. **Add an `index.ts` entry box** above all rows (outside swim lanes).
4. **Populate each row** with boxes per the "Layer Contents" sections above. Group related files into one box with a header (e.g., "Use Cases") and sub-labels.
5. **Draw arrows** strictly from the list above. Add `«stereotype»` labels.
6. **Style** per the Visual Style Guide. Composition layer → orange/amber background.
7. **Verify every arrow** by cross-referencing actual imports in the source files (do NOT include arrows for non-existent imports).
8. **Export** as PNG + SVG alongside the `.drawio` for embedding in papers/slides.

---

## Acceptance Criteria

- [ ] **Six modules** are represented: Presentation, Composition, Application, Domain, Infrastructure, Shared.
- [ ] `src/index.ts` entry point box is shown above all layers.
- [ ] `composition/create-agent-controller.ts` is in its own **Composition** layer (not inside Infrastructure or Presentation).
- [ ] **TUI components** (12 files under `presentation/tui/components/`) are shown as a grouped box.
- [ ] **`application/services/evaluator.ts`** is shown in Services and its arrows (→ LLMGateway, → Prompts/evaluator, → json-extractor) are drawn.
- [ ] `infrastructure/bootstrap/agent-factory.ts` is labelled "DI Factory / Bootstrap" (not "Composition Root").
- [ ] Infrastructure implements-arrows point to domain interfaces (dashed).
- [ ] Shared types are shown without creating circular dependency arrows.
- [ ] Diagram readable at 100% zoom without overlap.
