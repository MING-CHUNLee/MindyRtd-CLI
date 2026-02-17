---
name: code-review
description: Conducts systematic architecture and code quality reviews for the MindyCLI project, producing a structured review report. Use when the user says "review", "code review", "PR review", "check architecture", "before merge", "review this file", or after completing a feature implementation, refactor, or preparing to merge. Covers TypeScript CLI architecture compliance (MVC layers), cross-platform compatibility, test coverage, and documentation. Delegates code quality details to the typescript-clean-code sub-skill.
compatibility: Claude Code. Requires MindyCLI project structure (cli/src/ MVC architecture). Depends on typescript-clean-code skill as a sub-skill.
metadata:
  author: MindyCLI Team
  version: 1.1.0
  category: code-quality
---

# Code Review Skill

A systematic skill for conducting **architecture-level** code reviews on this project.

## Overview

This skill orchestrates the full review process across four layers. It ensures consistency, quality, and adherence to project standards.

**Key Distinction:**
- **This skill (`code-review`)**: Focuses on **WHERE** code lives and **HOW** it fits into the architecture
- **Sub-skills (`typescript-clean-code`)**: Focus on **HOW** the code is written (naming, functions, SOLID, etc.)

Full architecture reference: [references/architecture.md](references/architecture.md)

## Review Process

### Step 1: Understand the Change

1. Read the commit message or PR description
2. Identify the files changed
3. Understand the purpose of the change

### Step 2: Architecture Review

Check if the change follows the **MVC-inspired CLI Architecture**:

| Layer | Directories | Responsibility |
|-------|-------------|----------------|
| **Controller** | `commands/`, `controllers/` | User interaction, API communication |
| **Model** | `services/`, `types/` | Business logic, data structures |
| **View** | `views/`, `templates/` | Output formatting, prompt generation |
| **Infrastructure** | `config/`, `data/`, `utils/` | Cross-cutting concerns |

**Quick checklist:**
- [ ] Code is in the correct directory for its responsibility?
- [ ] Commands only handle CLI interaction (no business logic leaked in)?
- [ ] Cross-platform paths use `path.join()` and `process.platform`?

Full checklist: [references/review-checklist.md](references/review-checklist.md)

### Step 3: Code Quality Review

Delegates to language-specific sub-skills:
- TypeScript/JavaScript → `typescript-clean-code` skill
- Ruby → Ruby style guide (future skill)

**Skip when:** architecture-only changes, documentation-only updates, or config-only changes.

**Output:** Report saved to `skills/typescript-clean-code/reviews/<scope>-<date>-review.md`

### Step 4: Testing Review

- [ ] Tests exist for the new functionality?
- [ ] Existing tests still pass? (`npm test` in `cli/`)
- [ ] Tests use `toContain()` instead of exact path matching (cross-platform)?

### Step 5: Documentation Review

- [ ] Code is self-documenting?
- [ ] `IMPLEMENTATION_PLAN.md` updated if needed?
- [ ] Directives updated if behavior changed?

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

#### Strengths
- [What was done well]

#### Suggestions
- [Optional improvements]

#### Issues (Must Fix)
- [Critical problems]

### Verdict
- [ ] Approved
- [ ] Approved with suggestions
- [ ] Needs changes
```

## Examples

### Example 1: Reviewing a Service File

**User:** "Review library-scanner.ts for me."

**Actions:**
1. Confirm file is in `services/` (Model layer — architecture compliant)
2. Delegate to `typescript-clean-code` skill for quality review
3. Verify cross-platform path handling (`path.join()` + `process.platform`)
4. Confirm test exists (`library-scanner.test.ts`)
5. Check documentation completeness

**Result:** Code Review Report — Verdict: Approved

---

### Example 2: Reviewing a New Command Before Merge

**User:** "Review the new library.ts command before I merge."

**Actions:**
1. Confirm file is in `commands/` (Controller layer)
2. Business logic delegated to `library-scanner.ts` service
3. Output routed through `library-result.ts` view
4. Types imported from `types/library-info.ts`
5. Command-level tests missing

**Result:** Code Review Report — Verdict: Approved with suggestions (add command-level tests)

## Integration with Other Skills

| Skill | When to Use |
|-------|-------------|
| `typescript-clean-code` | TS/JS code quality review |
| (future) `ruby-clean-code` | Ruby API code |
| (future) `testing` | Test quality review |
