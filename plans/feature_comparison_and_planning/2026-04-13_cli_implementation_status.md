# Master Archaeology — MindyCLI Implementation Status

*Recorded: 2026-04-13*
*Companion to: `2026-04-13_master_archaeology_workflow.md`*

## Purpose

Map every step of the **Master Archaeology** workflow onto the current
MindyCLI codebase and state exactly which parts are **already implemented**,
which are **partially implemented**, and which are **not implemented at
all**. Every "implemented" claim is backed by a concrete file path that was
verified to exist at the time of writing. No speculation.

Legend:
- **Done** — the workflow step has a dedicated implementation in the codebase.
- **Partial** — supporting building blocks exist, but the step as described
  in the workflow is not fully realised.
- **Missing** — no code in the repository corresponds to this step.

---

## Status Table

| # | Master Archaeology Step | Status | Evidence in CLI | Reasoning |
|---|---|---|---|---|
| 1 | **Phase 1 — Entry A: upload attempted code** | Partial | [cli/src/application/tools/file-scan-tool.ts](cli/src/application/tools/file-scan-tool.ts), [cli/src/application/tools/file-read-tool.ts](cli/src/application/tools/file-read-tool.ts) | Workspace scan + file read tools exist, and both the tutor and ask pipelines already ingest the student's working files. What is missing is a *ceremonial* entry point that marks a specific file as "this is the code I'm stuck on" — today it is indistinguishable from any other file in the workspace. |
| 2 | **Phase 1 — Entry B: submit pseudocode** | Missing | — | No pseudocode-specific handling, no parser, no datatype. Free-text pseudocode would currently be dropped into the `instruction` string and treated as a normal user message. There is no downstream code that recognises it as a design sketch. |
| 3 | **Phase 1 — Upload hw (assignment)** | Partial | [cli/src/application/tools/pdf-read-tool.ts](cli/src/application/tools/pdf-read-tool.ts) | PDF reading exists (homework PDFs can be ingested as text). There is no `Assignment` entity in `cli/src/domain/entities/`, no binding between an assignment and the student's attempt, and no lifecycle around it. |
| 4 | **Phase 2 / Step 1 — AI Diagnosis: analyse submission** | Done (for the "analyse" half) | [cli/src/application/use-cases/execute-tutor-use-case.ts](cli/src/application/use-cases/execute-tutor-use-case.ts), [cli/src/application/use-cases/execute-ask-use-case.ts](cli/src/application/use-cases/execute-ask-use-case.ts) | The tutor use case already (a) scans the workspace, (b) reads files whose names are mentioned in the instruction, (c) assembles a prompt, and (d) streams an LLM response. This is exactly the "analyse the student's submission" half of Step 1. |
| 5 | **Phase 2 / Step 1 — AI Diagnosis: retrieve historical Master solutions** | Partial | [cli/src/application/services/knowledge-base.ts](cli/src/application/services/knowledge-base.ts), [cli/src/domain/entities/knowledge-entry.ts](cli/src/domain/entities/knowledge-entry.ts) | A retrieval mechanism exists — keyword TF-IDF-style scoring over a `KnowledgeEntry` store scoped to `<cwd>/.mindy/knowledge.json`. However: (i) `KnowledgeEntry` is a generic note, not a *Master solution* datatype; (ii) there is no distinction between reference solutions and arbitrary knowledge; (iii) the tutor use case does **not** currently inject knowledge-base hits into its prompt (the agent controller does, but the dedicated tutor path does not). Retrieval infrastructure is reusable; the "Master corpus" concept is absent. |
| 6 | **Phase 2 / Step 1 — Key principle: withhold full answer** | Done (as prompt-level instruction, not pipeline invariant) | [cli/src/application/prompts/tutor-agent.ts](cli/src/application/prompts/tutor-agent.ts) | `TutorStyle = 'socratic' \| 'guide'`. Socratic: "NEVER give the direct answer". Guide: step-by-step hints, full solution only after 3+ hints. This implements the "no complete answer" principle **at the prompt level only** — it relies on the LLM following the instruction. There is no pipeline-level guard that would block a full solution if the LLM chose to emit one. |
| 7 | **Phase 2 / Step 2 — Master Skeleton: code skeletons** | Missing | — | No skeleton extractor. No code that takes a reference solution and produces a redacted structural version. Note: [cli/src/application/use-cases/execute-solver-use-case.ts](cli/src/application/use-cases/execute-solver-use-case.ts) does the opposite — it generates *complete* solution files via the approval gate. |
| 8 | **Phase 2 / Step 2 — Master Skeleton: annotated decision points** | Missing | — | No decision-point annotator. No datatype representing "the choices a Master made" (data structure choice, control-flow shape, algorithmic variant). |
| 9 | **Phase 2 / Step 2 — Master Skeleton: guided prompts derived from skeleton** | Missing | — | The tutor prompts in `tutor-agent.ts` are *static templates*. There is no mechanism that derives per-task guiding prompts from a specific Master artefact. |
| 10 | **Phase 2 / Step 2 — Master Skeleton: abstraction-level control** | Missing | — | No parameter anywhere in the codebase controls how much of a reference solution is revealed versus redacted. |
| 11 | **Phase 2 / Step 2 — Master Skeleton: solution-masking guard (pipeline-level)** | Missing | — | The closest existing structure is the Phase-3 edit approval gate in [cli/src/application/tools/file-edit-tool.ts](cli/src/application/tools/file-edit-tool.ts), but it guards *writes*, not *reads/generations*. A guard that prevents the unredacted Master solution from leaving the pipeline does not exist. |
| 12 | **Phase 3 / Step 3 — Archaeological Analysis: reconstruct Master's decision process** | Missing | — | No use case, prompt, or service reconstructs *why* a Master made specific choices. Grep for `archaeolog`, `reflection`, `diagnos`, `master`, `skeleton` across `cli/src` returned no hits in application code. |
| 13 | **Phase 3 / Step 3 — Peer-review insights supplement** | Missing | — | No datatype for peer reviews, no ingestion path, no retrieval over peer feedback. |
| 14 | **Phase 3 / Step 4 — Reflection: contrast student vs Master approach** | Missing | — | [cli/src/application/services/evaluator.ts](cli/src/application/services/evaluator.ts) is named `Evaluator` but its responsibility is validating edit-output JSON and retrying format repair — it is **not** a pedagogical contrast generator. No other file produces a "critical differences" output. |

---

## Supporting Infrastructure (reusable for future steps)

These are not Master Archaeology steps themselves, but they are substrate
that later steps can stand on without being rebuilt:

| Component | File | Reusable for |
|---|---|---|
| ReAct loop with `[THOUGHT]/[ACTION]/[ANSWER]` markers | [cli/src/application/services/react-loop.ts](cli/src/application/services/react-loop.ts) | Any multi-step diagnosis / reflection pipeline. |
| Orchestrator (simple + multi-step modes) | [cli/src/application/orchestration/orchestrator.ts](cli/src/application/orchestration/orchestrator.ts) | Sequencing Diagnosis → Skeleton → Analysis → Reflection. |
| Tool registry and tool contract | [cli/src/application/orchestration/tool-registry.ts](cli/src/application/orchestration/tool-registry.ts) | Registering new tools (skeleton extractor, decision annotator, contrast generator). |
| Session + turn persistence | `cli/src/infrastructure/persistence/session-repository.ts` | Storing Master Archaeology runs and their artefacts. |
| `Artifact` entity (edit/diff/code/analysis/report) | `cli/src/domain/entities/artifact.ts` | Carrying skeleton, decision-point list, and contrast report as first-class turn outputs. |
| History summariser | [cli/src/application/services/history-summarizer.ts](cli/src/application/services/history-summarizer.ts) | Keeping multi-turn scaffolding sessions inside the context window. |
| Intent router / mode manager | [cli/src/application/services/intent-router.ts](cli/src/application/services/intent-router.ts), [cli/src/application/services/mode-manager.ts](cli/src/application/services/mode-manager.ts) | Routing students into a dedicated `archaeology` mode alongside the existing `ask`, `tutor`, `solver`, `agent` modes. |

---

## Summary by Phase

| Phase | Done | Partial | Missing |
|---|---|---|---|
| Phase 1 — Foresight | — | Upload attempted code; upload hw (PDF) | Pseudocode entry point |
| Phase 2 — Performance / Step 1 Diagnosis | "Analyse submission" via tutor pipeline; "no full answer" as prompt-level tutor styles | Historical Master retrieval (mechanism exists, Master-corpus concept absent) | — |
| Phase 2 — Performance / Step 2 Master Skeleton | — | — | **All four sub-parts**: skeleton extraction, decision-point annotation, guided-prompt derivation, abstraction-level control, plus pipeline-level solution-masking guard |
| Phase 3 — Self-Reflection / Step 3 Archaeological Analysis | — | — | Decision-process reconstruction; peer-review insights |
| Phase 3 — Self-Reflection / Step 4 Reflection | — | — | Student-vs-Master contrast generator |

**Headline.** Phase 1 ingestion and the "analysis" half of Step 1 are
largely covered by the existing tutor pipeline. The "no full answer"
principle is implemented as a prompt-level tutor style but not as a
pipeline invariant. **Everything from Step 2 onward is missing** — Master
Skeleton, Archaeological Analysis, and Reflection have no corresponding
code in the repository today.

---

## Concrete "Not Yet Built" List

Ordered by the workflow sequence, so this can become a work plan:

1. **Master-solution datatype + corpus** — a distinct entity (not reusing
   `KnowledgeEntry`) that stores past excellent student submissions with
   metadata (assignment id, author-anonymised tag, annotated decision
   points). Repository at `<cwd>/.mindy/masters.json` would mirror the
   existing knowledge-base path convention.
2. **Master retrieval service** — retrieval scoped to Master corpus only,
   parameterised by assignment id rather than free-text query.
3. **Pseudocode entry point** — an instruction flag or a distinct use case
   that marks input as design-sketch, so downstream steps know not to run
   file-level diffs on it.
4. **Skeleton extractor tool** — takes a Master solution + target
   abstraction level, returns a redacted structural form.
5. **Decision-point annotator tool** — takes a Master solution, returns a
   list of named choice points.
6. **Guided-prompt generator** — takes a skeleton + decision points +
   student's current attempt, returns task-specific guiding prompts (not
   the static templates in `tutor-agent.ts`).
7. **Solution-masking guard** — a pipeline-level check that rejects or
   rewrites any LLM output containing the unredacted Master solution.
   Structurally analogous to the edit approval gate, but on the generation
   side.
8. **Archaeological analysis use case** — `execute-archaeology-use-case.ts`
   that, given `(student artefact, Master artefact)`, emits a decision
   reconstruction.
9. **Peer-review ingestion** — datatype + loader for peer comments tied to
   Master artefacts.
10. **Contrast / reflection generator** — a service that produces the
    "critical differences" report and saves it as an `Artifact` of a new
    type (e.g. `reflection`).
11. **Archaeology mode** — registered in `mode-manager.ts` and
    `intent-router.ts`, wired through `agent-service.ts` as a new command
    alongside `tutor` and `solver`.

Each item above corresponds directly to a `Missing` row in the status
table. No item is listed without a Missing row to justify it.
