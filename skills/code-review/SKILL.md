---
name: code-review
version: 1.1.0
triggers:
  - review code
  - code review
  - review pr
  - review pull request
  - check architecture
  - architecture review
  - validate structure
languages:
  - typescript
  - javascript
  - ruby
categories:
  - code-quality
  - architecture
  - best-practices
dependencies:
  - typescript-clean-code
description: Systematic architecture-level code review for MindyCLI project
---

# Code Review Skill

A systematic skill for conducting **architecture-level** code reviews on this project.

## Overview

This skill provides a structured approach for reviewing code changes in the MindyCLI project. It ensures consistency, quality, and adherence to project standards.

### Scope & Relationship with Other Skills

This is a **multi-layer review skill** that orchestrates the entire code review process:

```
┌─────────────────────────────────────────────────────────┐
│  code-review/SKILL.md (THIS SKILL)                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Layer 1: Architecture Review                      │  │
│  │   → File structure, MVC compliance, dependencies  │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ Layer 2: Code Quality Review                      │  │
│  │   ┌───────────────────────────────────────────┐   │  │
│  │   │ Delegates to:                             │   │  │
│  │   │ • typescript-clean-code/SKILL.md          │   │  │
│  │   │ • (future) ruby-clean-code/SKILL.md       │   │  │
│  │   └───────────────────────────────────────────┘   │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ Layer 3: Testing Review                           │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ Layer 4: Documentation Review                     │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Key Distinction:**
- **This skill (`code-review`)**: Focuses on **WHERE** code lives and **HOW** it fits into the architecture
- **Sub-skills (`typescript-clean-code`)**: Focus on **HOW** the code is written (naming, functions, SOLID, etc.)

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

Check if the change follows the **MVC-inspired CLI Architecture**.

**📖 See detailed architecture guidelines:**
- [MVC Architecture Reference](./references/mvc-architecture.md) - Full architecture diagram and layer responsibilities
- [Architecture Checklist](./references/architecture-checklist.md) - Complete checklist with examples
- [Cross-Platform Guide](./references/cross-platform-guide.md) - Windows/macOS/Linux compatibility checks

**Quick Architecture Check:**

| Layer | Directories | Responsibility |
|-------|-------------|----------------|
| **Controller** | `commands/`, `controllers/` | User interaction, API communication |
| **Model** | `services/`, `types/` | Business logic, data structures |
| **View** | `views/`, `templates/` | Output formatting, prompt generation |
| **Infrastructure** | `config/`, `data/`, `utils/` | Cross-cutting concerns |

**Critical Questions:**
- [ ] Is the code in the correct directory for its responsibility?
- [ ] Does it follow the dependency flow? (See [Architecture Checklist](./references/architecture-checklist.md#dependency-flow))
- [ ] Is it cross-platform compatible? (See [Cross-Platform Guide](./references/cross-platform-guide.md))

### Step 3: Code Quality Review

**This step delegates to language-specific clean code skills.**

Apply the appropriate sub-skill based on language:
- TypeScript/JavaScript → Use `typescript-clean-code/SKILL.md`
- Ruby → Use Ruby style guide (future skill)

**What this step does:**
- Evaluates code against Clean Code principles (naming, functions, SOLID, etc.)
- Automatically fixes issues where possible
- Runs tests before and after changes
- Generates a detailed quality report

**When to skip this step:**
- Architecture-only changes (moving files, restructuring directories)
- Documentation-only updates
- Configuration changes

**Output:** A detailed review report saved to `skills/typescript-clean-code/reviews/` following the naming convention `<scope>-<date>-review.md`

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

## Reference Documentation

- [MVC Architecture](./references/mvc-architecture.md) - Complete architecture overview
- [Architecture Checklist](./references/architecture-checklist.md) - Detailed review checklist
- [Cross-Platform Guide](./references/cross-platform-guide.md) - Platform compatibility guidelines
- [CLI Structure Diagram](./references/cli-structure-diagram.md) - Visual architecture reference

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
