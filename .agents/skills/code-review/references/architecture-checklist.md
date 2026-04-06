# Architecture Checklist

This checklist codifies the layer boundaries and naming conventions for Mindy CLI.
Use it during code review to verify that new or changed code respects Clean Architecture.

---

## Layer Map

```
cli/src/
├── domain/              Zero external deps. Entities, value objects, interfaces.
├── application/
│   ├── use-cases/       One class per user-visible action. Entry point for business logic.
│   ├── orchestration/   ReActLoop, Orchestrator, ToolRegistry — agent loop coordination.
│   ├── facade/          AgentService — DI composition root, session lifecycle, events.
│   ├── services/        Stateless domain services (DiffEngine, FileReadService, Evaluator, …).
│   ├── tools/           AgentTool implementations — LLM-callable capability units.
│   └── prompts/         Prompt templates & section builders.
├── infrastructure/      Concrete I/O adapters (LLM API, fs, R adapter, persistence, plugins).
├── presentation/        Ink TUI, views, i18n.
└── shared/              Cross-cutting types & utilities.
```

---

## 1. Dependency Direction

| Rule | Check |
|------|-------|
| domain imports nothing outside domain | `grep -r "from '../../application\|../../infrastructure\|../../presentation" src/domain/` returns 0 hits |
| application imports only domain (+ shared) | No direct `import ... from '../../infrastructure'` in services/tools/use-cases, except orchestration files that receive infra via constructor injection |
| tools never import infrastructure directly | Tools receive domain interfaces (IFileSystem, IRScriptRunner) or application services via DI |
| infrastructure implements domain interfaces | Every domain port (IFileSystem, IRScriptRunner, ILLMGateway) has exactly one infra impl |

## 2. Service vs Tool Distinction

### Service (application/services/)

- **Caller**: Use cases, orchestration, or other services.
- **Purpose**: Encapsulates a reusable piece of **domain logic or I/O coordination** (diff computation, file reading with guards, intent classification, history summarization).
- **Characteristics**:
  - Stateless (or manages internal state invisible to callers).
  - Has NO `schema` property — not visible to the LLM.
  - May depend on domain interfaces (ports) for I/O.
  - May be composed into tools or use cases.

### Tool (application/tools/)

- **Caller**: `ToolRegistry`, driven by LLM output during the ReAct loop.
- **Purpose**: Exposes a single **LLM-callable capability** with a strict contract (name, schema, execute).
- **Characteristics**:
  - Implements `AgentTool` interface (name + schema + execute).
  - `schema` is injected into the system prompt so the LLM knows how to call it.
  - Thin adapter: validates LLM input, delegates real work to a **service** or **domain interface**.
  - Should NOT contain business logic beyond input validation and safety guards.

### Decision Flowchart

```
Is the LLM the caller?
  ├─ YES → Tool (implements AgentTool, has schema)
  └─ NO  → Is it loop coordination (ReAct, Orchestrator, ToolRegistry)?
             ├─ YES → Orchestration
             └─ NO  → Service
```

## 3. Orchestration Layer (application/orchestration/)

| File | Role |
|------|------|
| `react-loop.ts` | Drives the [THOUGHT]/[ACTION]/[ANSWER] loop; calls ToolRegistry |
| `orchestrator.ts` | Manages single/multi-step task execution; owns token budget |
| `tool-registry.ts` | Central registry + dispatcher; validates required params before delegation |

These files coordinate the agent loop. They are **not** domain services (they don't encapsulate reusable business logic) and **not** tools (the LLM doesn't call them). They form a distinct coordination layer.

## 3b. Facade Layer (application/facade/)

| File | Role |
|------|------|
| `agent-service.ts` | DI composition root; wires tools/services/infrastructure; manages session lifecycle; emits events |

The facade is the integration point where controllers request use cases. It constructs all dependencies and manages long-lived state (sessions, tool registry).

## 4. Correct Call Chains

```
# Agent pipeline
Controller → UseCase → Orchestrator → ReActLoop → ToolRegistry
                                                       ↓
                                                   AgentTool
                                                       ↓
                                                   Service (optional)
                                                       ↓
                                                   Domain Interface (port)
                                                       ↓
                                                   Infrastructure (adapter)

# Ask pipeline (no tools)
Controller → UseCase → LLMGateway (via port)
```

### Anti-patterns

| Anti-pattern | Why it's wrong |
|-------------|----------------|
| Controller calls Tool directly | Tools are for LLM-driven invocation only |
| Tool contains complex business logic | Tool should be a thin adapter; extract logic to a Service |
| Service imports from infrastructure/ directly | Use domain interface (port) + DI |
| Orchestration files placed in services/ | Muddies the distinction; use orchestration/ folder |
| Tool calls another Tool | Tools are leaf nodes; share logic via a common Service |

## 5. Naming Conventions

| Layer | Suffix | Example |
|-------|--------|---------|
| Domain entity | (none) | `ConversationSession`, `FileChange` |
| Domain interface (port) | `I` prefix | `IFileSystem`, `IRScriptRunner` |
| Application service | `Service` / descriptive | `FileReadService`, `DiffEngine`, `Evaluator` |
| Application tool | `Tool` | `FileReadTool`, `RExecTool` |
| Use case | `UseCase` | `ExecuteInstructionUseCase` |
| Infrastructure adapter | matches domain name | `LocalFileSystem` (implements `IFileSystem`) |

## 6. New Code Checklist

When adding new functionality, verify:

- [ ] New tool implements `AgentTool` and delegates to a service or domain port
- [ ] New service has no `schema` property and does not implement `AgentTool`
- [ ] No circular dependencies between application sub-folders
- [ ] Domain interfaces are defined in `domain/interfaces/`, not in application/
- [ ] Infrastructure concrete classes are not imported in application/ (except via DI wiring in `application/facade/agent-service.ts`)
- [ ] Tool is registered in `application/facade/agent-service.ts` (composition root)
- [ ] Tests mock domain interfaces, not concrete infrastructure classes
