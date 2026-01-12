# Code Review Skill

A systematic skill for conducting code reviews on this project.

## Overview

This skill provides a structured approach for reviewing code changes in the MindyCLI project. It ensures consistency, quality, and adherence to project standards.

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

Check if the change follows the CLI Frontend Architecture:

```
cli/src/
├── index.ts            # Entry point
├── commands/           # CLI command handlers
│   └── scan.ts
├── services/           # Business logic (local or API calls)
│   └── file-scanner.ts
├── types/              # TypeScript type definitions & data models
│   ├── index.ts        # Main exports
│   ├── file-info.ts    # File metadata type
│   ├── project-info.ts # Project metadata type
│   └── scan-result.ts  # Scan result type
├── utils/              # Helper functions & errors
│   ├── format.ts
│   └── errors.ts
└── views/              # Output formatting
    ├── banner.ts
    └── scan-result.ts
```

**Architecture Questions:**
- [ ] Is the code in the correct directory?
- [ ] Commands only handle CLI interaction, not business logic?
- [ ] Services contain reusable logic?
- [ ] Views only handle output formatting?
- [ ] Types are properly defined and exported from `types/index.ts`?

**Note:** This is a **frontend CLI**, so:
- ❌ No `infrastructure/` (that's for backend Clean Architecture)
- ❌ No `application/` layer (that's for backend DDD)
- ❌ No `domain/` directory (frontend should use `types/` for all data structures)
- ✅ All data models and interfaces live in `types/`

### Step 3: Code Quality Review

Apply the appropriate sub-skill based on language:
- TypeScript/JavaScript → Use `typescript-clean-code/SKILL.md`
- Ruby → Use Ruby style guide (future skill)

### Step 4: Testing Review

- [ ] Are there tests for the new functionality?
- [ ] Do existing tests still pass?
- [ ] Is test coverage adequate?

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

## Example Usage

```
Agent: I need to review the file-scanner.ts file.

1. Check architecture compliance ✓ (in services/)
2. Apply typescript-clean-code skill ✓
3. Verify tests exist ⚠️ (needs more coverage)
4. Check documentation ✓

Result: Approved with suggestion to add more tests.
```
