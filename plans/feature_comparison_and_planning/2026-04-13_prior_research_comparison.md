# Master Archaeology — Prior Research Coverage Analysis

*Recorded: 2026-04-13*
*Companion to: `2026-04-13_master_archaeology_workflow.md`*

## Purpose

This document audits each step of the **Master Archaeology** workflow against
established research areas, to identify (a) which components are already
well-covered by prior work and (b) which components are under-explored and
therefore candidates for a research contribution.

**Discipline note.** Only research areas the author can name with confidence
are listed. Where a mapping is uncertain, the cell is marked *"area only —
specific citation pending literature review"* rather than fabricated. No
paper titles, venues, or years are asserted unless they are textbook-level
canonical references.

---

## Comparison Table

| # | Workflow Step | Closest Prior Research Area | Coverage | Overlap (what prior work already does) | Gap (what prior work does *not* do) |
|---|---|---|---|---|---|
| 0 | Three-phase structure (Foresight → Performance → Self-Reflection) | Self-Regulated Learning — Zimmerman (2000), cited in the source doc | **Full (theoretical frame)** | Provides the cyclical model the workflow is organised around. | N/A — used as theoretical foundation, not claimed as novel. |
| 1 | Entry points A/B (stuck code vs. pseudocode) | Help-seeking & intelligent tutoring systems literature (area only) | **Partial** | ITS research has long accepted both partial attempts and plan-level input as tutor entry points. | The A/B split as a *single unified pipeline* feeding identical downstream steps is a design choice, not a research claim. |
| 2 | **Step 1 — AI Diagnosis** (analyse submission, retrieve Master solutions, withhold full answer) | Retrieval-Augmented Generation (Lewis et al., 2020); LLM-based programming feedback; Adaptive RAG / guided-retrieval agents (area only — specific citation pending literature review) | **High** | RAG over a curated solution corpus and LLM feedback on student code are both active, well-published areas. The "withhold full answer" constraint is also discussed in LLM-tutor alignment work. | Nothing novel in the retrieval mechanism itself. |
| 3 | **Step 2 — Master Skeleton** (derive skeleton + annotated decision points + guided prompts from past Master submissions, guarantee no full solution leaks) | Worked-example effect (Sweller and colleagues); worked-example *fading* / completion problems (Renkl & Atkinson); Parsons problems (Parsons & Haden, 2006); code scaffolding in CS education | **Low — this is the main gap** | Worked-example fading removes steps from an expert solution to force student completion. Parsons problems shuffle code blocks. Both share the spirit of "not a full solution." | None of these lines, to the author's knowledge, (a) *automatically extract* a skeleton from a historical corpus of peer-produced "Master" solutions, (b) *parametrise the abstraction level* of that skeleton, (c) attach *decision-point annotations* that name the choices a Master made, or (d) enforce a *solution-masking guard* that prevents the full reference solution from being revealed by downstream generation. This combination is the candidate contribution. |
| 4 | **Step 3 — Archaeological Analysis** (reconstruct *why* a Master made specific design choices, supplemented by peer-review insights) | Self-explanation prompting (Chi and colleagues); explanation-based LLM tutors (area only) | **Partial** | Self-explanation research shows that asking learners to explain worked examples improves transfer. LLM tutors commonly "explain this code." | The direction is inverted: Master Archaeology asks the *system* (not the learner) to reverse-engineer decision rationale from an artefact, then uses that reconstruction as scaffolding. Framed as "decision reconstruction from artefact" rather than "explain this code," it is under-explored. |
| 5 | **Step 4 — Reflection** (AI highlights critical differences between student and Master approach) | Contrastive cases / comparison-based learning (Rittle-Johnson & Star and colleagues); analogical comparison in learning sciences | **High** | Comparing two worked solutions to drive conceptual learning is a well-established, replicated finding in mathematics and CS education. | Nothing novel in the pedagogical principle. Novelty, if any, would be in *automating* the contrast over heterogeneous student/Master code pairs — but that alone is an engineering increment, not a research claim. |
| 6 | Core principle: "strategic scaffolding over complete answers" as a hard constraint on generation | LLM alignment / controllable generation; educational-AI guardrails (area only) | **Partial** | Refusal-to-reveal and content-gating are general LLM-alignment techniques. | Operationalising "no complete solution" as a *pipeline-level invariant* over retrieval + skeleton generation + reflection (rather than a single-prompt instruction) is not something the author has seen formalised. Shares the spirit of the existing MindyCLI Phase-3 safety gate but inverted in purpose. |

---

## Overall Assessment

| Layer | Verdict |
|---|---|
| Theoretical framing (SRL) | Borrowed, correctly attributed. Not a contribution. |
| Diagnosis (Step 1) | Standard RAG + LLM feedback. Baseline, not contribution. |
| **Master Skeleton (Step 2)** | **Main research candidate.** The combination of Master-corpus-driven skeleton extraction, abstraction-level control, decision-point annotation, and enforced solution masking is not covered by any single line of work the author can cite. |
| Archaeological Analysis (Step 3) | Secondary research candidate. Related to self-explanation but inverts the agent of explanation. Needs a literature pass before claiming novelty. |
| Reflection (Step 4) | Pedagogically standard. Engineering-level novelty only. |
| Pipeline-level "no full solution" invariant | Under-explored as a formal property; possible secondary contribution. |

---

## Implications for MindyCLI

Mapping the gap analysis onto the current codebase (paths relative to `cli/src/`):

- **Reusable as baselines** (do *not* rebuild):
  - [application/services/knowledge-base.ts](cli/src/application/services/knowledge-base.ts) — keyword retrieval already covers the retrieval side of Step 1.
  - [application/use-cases/execute-ask-use-case.ts](cli/src/application/use-cases/execute-ask-use-case.ts) — existing ask pipeline is a working Step-1 baseline.
  - [application/services/react-loop.ts](cli/src/application/services/react-loop.ts) + [application/services/evaluator.ts](cli/src/application/services/evaluator.ts) — sufficient for Step 4 contrast generation.
  - [application/tools/file-edit-tool.ts](cli/src/application/tools/file-edit-tool.ts) Phase-3 safety gate — structurally similar to the "no full solution" invariant but operates on write side; the Master-Skeleton invariant would operate on *read/generate* side.

- **New modules required for Step 2 (Master Skeleton)** — none of these exist yet:
  - A **skeleton extractor** that takes a Master solution and produces a redacted structural form at a chosen abstraction level.
  - A **decision-point annotator** that names the choices the Master made (data structure, control flow, algorithmic variant).
  - A **solution-masking guard** that runs at pipeline level and blocks any downstream step from emitting the un-redacted Master solution, even if the LLM is asked to.

- **New module likely required for Step 3 (Archaeological Analysis)**:
  - A **decision-reconstruction prompt/tool** that takes `(Master artefact, student artefact)` and outputs a hypothesised rationale trace, separated from the explanation-to-student surface.

- **Suggested next step**: before coding, run a focused literature pass on
  (i) worked-example fading in CS education, (ii) Parsons-problem generation
  from real codebases, and (iii) LLM-based skeleton/scaffold generation, to
  confirm the Step-2 gap is real and to sharpen the contribution statement.
  This document should be updated with concrete citations after that pass.

---

## Open Questions (to resolve before claiming contribution)

1. Does any existing worked-example-fading system derive its examples from a *peer corpus* rather than an instructor-authored reference? (Unknown to author.)
2. Has any Parsons-problem generator been driven by a retrieval step over past student submissions? (Unknown to author.)
3. Is there prior work that formalises "never reveal the full reference" as a pipeline invariant rather than a prompt instruction? (Unknown to author.)
4. For Step 3, is there existing work on LLM-based *decision reconstruction* (as opposed to code explanation) in an educational setting? (Unknown to author.)

Each "Unknown" above is a literature-review task, not an assumption.
