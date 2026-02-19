---
name: typescript-clean-code
version: 1.1.0
triggers:
  - clean code review
  - typescript review
  - code quality check
  - refactor typescript
  - improve code quality
  - evaluate clean code
languages:
  - typescript
  - javascript
categories:
  - code-quality
  - refactoring
  - clean-code
  - best-practices
dependencies: []
description: Comprehensive TypeScript/JavaScript Clean Code evaluation and automated fixing based on ES6+ standards
---

# TypeScript Clean Code Skill

A comprehensive skill for evaluating and improving TypeScript/JavaScript code against ES6+ Clean Code standards.

## Overview

This skill applies Clean Code principles from [ryanmcdermott/clean-code-javascript](https://github.com/ryanmcdermott/clean-code-javascript) to TypeScript codebases. **After evaluation, it automatically fixes issues and verifies with tests.**

## Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  1. WRITE TESTS                                             │
│     Write tests for existing functionality before changes   │
├─────────────────────────────────────────────────────────────┤
│  2. RUN TESTS                                               │
│     Verify all tests pass (baseline)                        │
├─────────────────────────────────────────────────────────────┤
│  3. EVALUATE CODE                                           │
│     Score code against Clean Code checklist                 │
├─────────────────────────────────────────────────────────────┤
│  4. FIX ISSUES                                              │
│     Apply improvements based on evaluation                  │
├─────────────────────────────────────────────────────────────┤
│  5. RUN TESTS AGAIN                                         │
│     Verify no functionality broken                          │
├─────────────────────────────────────────────────────────────┤
│  6. GENERATE REPORT                                         │
│     Document changes and final scores                       │
└─────────────────────────────────────────────────────────────┘
```

## Step 1: Write Tests First

Before any code changes, create tests for existing functionality.

**📖 See detailed testing guide:** [Testing Guide](./references/testing-guide.md)

**Quick Example:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { ScanService } from '../src/services/scan-service';

describe('ScanService', () => {
  it('should detect R files in directory', async () => {
    // Arrange
    const mockFs = { readdir: vi.fn().mockResolvedValue(['file.R']) };
    const service = new ScanService(mockFs);

    // Act
    const result = await service.scan({ targetDir: '.' });

    // Assert
    expect(result.files.rScripts.length).toBeGreaterThan(0);
  });
});
```

## Step 2: Evaluation Criteria

**📖 See complete evaluation checklist:** [Clean Code Checklist](./references/clean-code-checklist.md)

### 7 Categories (Scoring)

| Category | Weight | Key Focus |
|----------|--------|-----------|
| **Variables** | 15% | Meaningful names, no magic numbers |
| **Functions** | 25% | Single responsibility, ≤2 parameters |
| **Classes** | 20% | ES6 syntax, encapsulation |
| **SOLID** | 20% | Single Responsibility, DI |
| **Error Handling** | 10% | Custom errors, no silent failures |
| **Async/Await** | 5% | Modern async patterns |
| **Comments** | 5% | Self-documenting code |

**Quick Checklist:**
- [ ] No magic numbers (extract constants)
- [ ] Functions have ≤2 parameters (use object destructuring)
- [ ] Single responsibility per function/class
- [ ] Custom error classes for specific failures
- [ ] Async/await instead of callbacks
- [ ] Self-documenting code (minimal comments)

## Step 3: Common Fixes

**📖 See complete fix catalog:** [Common Fixes Reference](./references/common-fixes.md)

**📖 See good/bad examples:** [Examples Directory](./examples/)

### Most Common Issues

1. **Magic Numbers** → Extract constants
2. **Too Many Parameters** → Object destructuring
3. **Large Functions** → Extract smaller functions
4. **Generic Errors** → Custom error classes
5. **Callback Hell** → Async/await

**Quick Example:**
```typescript
// ❌ Before
function createUser(name, email, age, isAdmin) {
  setTimeout(() => {
    throw new Error('User creation failed');
  }, 86400000);
}

// ✅ After
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

interface CreateUserOptions {
  name: string;
  email: string;
  age: number;
  isAdmin: boolean;
}

async function createUser(options: CreateUserOptions): Promise<User> {
  await delay(MILLISECONDS_PER_DAY);
  throw new UserCreationError('User creation failed', options.email);
}
```

## Step 4: Run Tests

```bash
npm test
# or
npm run test:watch
```

All tests must pass before and after changes.

## Output Format

After completing the review and fixes, generate a report following this format:

```markdown
# Clean Code Review & Fix Report

**Date:** YYYY-MM-DD
**Files:** [list]

## Test Results

### Before Changes
- Tests: X passed, Y failed
- Coverage: XX%

### After Changes
- Tests: X passed, 0 failed
- Coverage: XX%

## Changes Made

| Category | Issue | Fix Applied | File |
|----------|-------|-------------|------|
| Variables | Magic number | Extracted constant | scan.ts |
| Functions | Too many params | Object destructuring | service.ts |

## Final Scores

| Category | Before | After | Δ |
|----------|--------|-------|---|
| Variables | 7/10 | 9/10 | +2 |
| Functions | 6/10 | 8/10 | +2 |
| **Total** | 7.2/10 | 8.5/10 | +1.3 |
```

## File Naming Convention

All review reports must be saved in `skills/typescript-clean-code/reviews/` following this naming pattern:

### Format
```
<scope>-<date>-review.md
```

### Components
- **scope**: The area being reviewed (lowercase, hyphen-separated)
  - Examples: `cli`, `services`, `commands`, `architecture`, `full-codebase`
- **date**: ISO 8601 date format `YYYY-MM-DD`
- **suffix**: Always end with `-review.md`

### Examples
- ✅ `cli-2026-02-19-review.md` - Full CLI review
- ✅ `services-2026-02-15-review.md` - Services layer review
- ✅ `commands-2026-03-01-review.md` - Commands review
- ❌ `cli-v1.0.0-review.md` - Don't use version numbers
- ❌ `review-2026-02-19.md` - Missing scope
- ❌ `services_review.md` - Missing date, wrong separator

### Rationale
- **Date-based**: Reviews are point-in-time snapshots
- **Chronological sorting**: Files naturally sort by date
- **Scope clarity**: Immediately identifies what was reviewed

## Reference Documentation

- [Clean Code Checklist](./references/clean-code-checklist.md) - Complete 7-category evaluation criteria
- [Common Fixes](./references/common-fixes.md) - Detailed fix patterns with before/after examples
- [Testing Guide](./references/testing-guide.md) - How to write tests for Clean Code reviews
- [Examples](./examples/) - Good and bad code examples

## Quick Command

To trigger this skill, say:

> "Run TypeScript Clean Code review on [file/directory], fix issues, and verify with tests"

The agent will:
1. Write/verify tests exist
2. Run baseline tests
3. Evaluate against checklist
4. Apply fixes
5. Run tests again
6. Generate report in `reviews/<scope>-<date>-review.md`

## Integration with Other Skills

This skill is typically invoked by:
- **code-review/SKILL.md** - As part of Layer 2 (Code Quality Review)

This skill can invoke:
- (future) **testing/SKILL.md** - For advanced test coverage analysis
