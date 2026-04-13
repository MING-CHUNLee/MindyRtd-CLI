# MindyCLI vs. Prior Products — Feature Coverage Table

**Date:** 2026-04-13
**Purpose:** Determine whether MindyCLI's proposed solutions are already covered by prior research (Khanmigo, MathGPT, Flexi 2.0, Yixue Squirrel AI, BOXFiSH).
**Audit basis:** Verified against actual MindyCLI source code (not speculation). See evidence column below for key ✓ marks.

---

## Comparison Table

| Feature | Khanmigo | MathGPT | Flexi 2.0 | Squirrel AI | BOXFiSH | **MindyCLI** |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Socratic questioning | ✓ | ✗ | ✗ | ✗ | ✗ | **✓** |
| Step-by-step problem solving | ✓ | ✓ | ✗ | ✗ | ✗ | **✓** |
| Direct solution generation | partial | ✓ | ✓ | ✗ | ✗ | **✓** |
| Learner-controlled mode switching | ✗ | ✗ | ✗ | ✗ | ✗ | **✓** *(unique)* |
| Adaptive quizzing | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| Writing / brainstorming assistance | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Simulated roleplay | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Mathematical proof generation | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Inquiry-driven active learning | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Practical real-world application bridging | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| Personalized feedback | partial | ✗ | ✓ | ✓ | ✓ | ✗ |
| Diagnostic pre-testing | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| Personalized learning path | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ |
| Mastery-based progression | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ |
| Real-time teacher dashboard | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| Immersive media (video/images) | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| Flipped classroom support | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| **Code execution in learning loop** | ✗ | ✗ | ✗ | ✗ | ✗ | **✓** *(unique)* |
| **Diff-approval safety gate** | ✗ | ✗ | ✗ | ✗ | ✗ | **✓** *(unique)* |

---

## Evidence for MindyCLI ✓ marks

| Feature | Source |
|---|---|
| Socratic questioning | [tutor-agent.ts:14-20](../../cli/src/application/prompts/tutor-agent.ts#L14-L20) — system prompt: "NEVER give the direct answer … end every response with a guiding question" |
| Step-by-step problem solving | [tutor-agent.ts:24-29](../../cli/src/application/prompts/tutor-agent.ts#L24-L29) — Step 1/2 + Hint N structure; full solution only after 3+ hints |
| Direct solution generation | [solver-agent.ts:8-27](../../cli/src/application/prompts/solver-agent.ts#L8-L27) — solver mode writes complete solution file |
| Learner-controlled mode switching | [mode-manager.ts:23](../../cli/src/application/services/mode-manager.ts#L23) + [slash-command-router.ts:50-57](../../cli/src/application/services/slash-command-router.ts#L50-L57) — `/solver` `/tutor-socratic` `/tutor-guide` `/default` persisted via settings |
| Code execution in learning loop | `r_exec` tool (read-only guarded R execution) invoked inside ReAct loop alongside tutor prompts |
| Diff-approval safety gate | Phase 3 gate in `ExecuteInstructionUseCase` — edit artifacts diffed and require user approval before `FileEditTool.applyEdit` writes to disk |

---

## Audit notes — previously mis-labelled ✓ corrected to ✗

1. **Personalized feedback** — Session history and knowledge base are *conversation memory* and *user-authored notes*, NOT a learner model. MindyCLI has no skill-level inference, no error-pattern tracking, no cross-session learner profile. Adapted responses require structured learner state that MindyCLI does not build.

2. **Inquiry-driven active learning** — Socratic questioning (tutor asks) is NOT inquiry-driven learning (student initiates investigation). MathGPT's definition targets student-initiated real-world investigations; MindyCLI has no corresponding mechanism.

3. **Practical real-world application bridging** — "R is used for real data analysis" is a tool-domain attribute, not a pedagogical feature. Flexi 2.0's definition is an explicit classroom-theory → production-application bridge; MindyCLI has no analogous design.

---

## Novelty summary — what prior research does NOT cover

Three features in MindyCLI are not found in any of the five prior products:

1. **Learner-controlled pedagogical mode switching** — the same session can switch between Socratic / step-by-step guide / direct solver on demand. Prior products are each fixed to one pedagogy at the product level.
2. **Executable code sandbox inside the learning loop** — R execution and tutor dialogue occur in the same ReAct loop, allowing learners to run code as part of inquiry.
3. **Diff-approval safety gate** — LLM-proposed file modifications are diffed and require explicit user approval before being written to disk.

## Overlap that must be acknowledged in related work

- **Socratic questioning** — overlaps with Khanmigo.
- **Step-by-step problem solving** — overlaps with Khanmigo and MathGPT.
- **Direct solution generation** — overlaps with MathGPT and Flexi 2.0.

These must be cited honestly; MindyCLI's contribution is the *combination and mode-switching*, not the individual pedagogies.

## Gaps — features MindyCLI does NOT have (future work candidates)

Diagnostic pre-testing, personalized learning path, mastery-based progression, personalized feedback (learner model), real-time teacher dashboard, adaptive quizzing, immersive media, flipped classroom support.

If MindyCLI is positioned as an *educational tool*, reviewers will likely ask for at least **diagnostic pre-testing** and **mastery-based progression** — the minimum viable adaptive learning loop.
