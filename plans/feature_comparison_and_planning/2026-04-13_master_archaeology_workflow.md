# Master Archaeology — Adaptive Agent Workflow

*Recorded: 2026-04-13*
*Source: Workflow design discussed with advisor last year (slide titled "The workflows we designed last year")*

## Overview

This workflow, named **Master Archaeology**, defines an adaptive agent that supports students during programming tasks. Its core design principle is to provide **strategic scaffolding** rather than complete solutions, guiding students to finish the work themselves and reflect on their learning process.

The workflow consists of **three phases**, **five strategic steps**, and **two entry points**.

---

## Entry Points

Students can enter the workflow through two scenarios, both of which feed into the same five-step pipeline:

- **A. Student Gets Stuck** — upload attempted code.
- **B. Pseudocode Ideation** — submit pseudocode as an initial design sketch.

Shared action: **Upload hw** (upload the assignment).

---

## Phase 1 — Foresight Phase

Corresponds to the two entry points:
- **Upload attempted code** (the code where the student got stuck)
- **Submit pseudocode** (the student's design sketch)

The goal of this phase is to bring the student into the system with either an existing attempt or an early-stage idea, which becomes the basis for later diagnosis and scaffolding.

---

## Phase 2 — Performance Phase

### Step 1: AI Diagnosis

- Analyzes the student's submission (code or pseudocode).
- Retrieves relevant historical Master solutions as diagnostic references.
- **Key principle**: does not provide complete answers — only strategic scaffolding.

### Step 2: Master Skeleton

- Presents **different or more advanced** approaches drawn from past excellent student work (Masters).
- Output takes the form of:
  - **Code skeletons**
  - **Annotated decision points**
  - **Guided prompts**
- **Key principle**: the skeleton is not a full solution — it requires the student to think and complete the solution themselves.

---

## Phase 3 — Self-Reflection Phase

### Step 3: Archaeological Analysis

- Guides the student to **reconstruct the decision-making process** behind a Master's solution.
- Supplemented with **peer review insights** to broaden the student's understanding of alternative solution paths.

### Step 4: Reflection

- The AI highlights the **critical differences** between the student's approach and the Master's approach.
- Purpose: foster metacognition — helping the student understand *why* one approach may be better or worse than another.

---

## Core Design Principles

1. **Strategic scaffolding over complete answers**: the system never hands over a finished solution — only skeletons, decision points, and guiding prompts.
2. **Historical Master solution retrieval**: the diagnosis step draws on past excellent student solutions as its reference base.
3. **Reconstructing the decision process**: the reflection phase takes an "archaeological" stance, recovering *why* a Master made specific design choices.
4. **Highlighting critical differences**: the AI explicitly contrasts student and Master solutions to drive deeper learning.

---

## Theoretical Foundation

> Zimmerman, B. J. (2000). Attaining self-regulation: A social cognitive perspective. In M. Boekaerts, P. R. Pintrich, & M. Zeidner (Eds.), *Handbook of self-regulation* (pp. 13–39). Academic Press.

The three-phase structure (Foresight → Performance → Self-Reflection) maps directly onto Zimmerman's Self-Regulated Learning (SRL) cyclical model.
