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
cli/
├── src/
│   ├── index.ts              # Entry point
│   ├── commands/             # CLI command handlers
│   │   ├── scan.ts           # File scanning command
│   │   └── library.ts        # R library scanning command
│   ├── services/             # Business logic (local or API calls)
│   │   ├── file-scanner.ts   # File detection & scanning
│   │   └── library-scanner.ts # R package/library scanning (cross-platform)
│   ├── types/                # TypeScript type definitions & data models
│   │   ├── index.ts          # Main exports
│   │   ├── file-info.ts      # File metadata type
│   │   ├── project-info.ts   # Project metadata type
│   │   ├── scan-result.ts    # Scan result type
│   │   └── library-info.ts   # R library/package info type
│   ├── utils/                # Helper functions & errors
│   │   ├── format.ts         # Output formatting helpers
│   │   └── errors.ts         # Custom error classes
│   └── views/                # Output formatting
│       ├── index.ts          # View exports
│       ├── banner.ts         # CLI banner display
│       ├── scan-result.ts    # File scan result display
│       └── library-result.ts # Library scan result display
└── tests/                    # Unit tests (Vitest)
    ├── types.test.ts         # Type definition tests
    ├── errors.test.ts        # Error class tests
    ├── file-scanner.test.ts  # File scanner tests
    ├── library-info.test.ts  # Library info type tests
    └── library-scanner.test.ts # Library scanner tests (cross-platform)
```

**Architecture Questions:**
- [ ] Is the code in the correct directory?
- [ ] Commands only handle CLI interaction, not business logic?
- [ ] Services contain reusable logic?
- [ ] Views only handle output formatting?
- [ ] Types are properly defined and exported from `types/index.ts`?
- [ ] Tests exist in `tests/` directory with `.test.ts` suffix?

**Cross-Platform Considerations:**
- [ ] Does the code handle Windows, macOS, and Linux paths correctly?
- [ ] Are platform-specific paths using `process.platform` detection?
- [ ] Is `path.join()` used instead of hardcoded path separators?
- [ ] Are executable names platform-aware (e.g., `.exe` on Windows)?

**Note:** This is a **frontend CLI**, so:
- ❌ No `infrastructure/` (that's for backend Clean Architecture)
- ❌ No `application/` layer (that's for backend DDD)
- ❌ No `domain/` directory (frontend should use `types/` for all data structures)
- ✅ All data models and interfaces live in `types/`
- ✅ Tests use Vitest framework

### Step 3: Code Quality Review

Apply the appropriate sub-skill based on language:
- TypeScript/JavaScript → Use `typescript-clean-code/SKILL.md`
- Ruby → Use Ruby style guide (future skill)

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
