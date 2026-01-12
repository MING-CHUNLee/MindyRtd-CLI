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

Before any code changes, create tests for existing functionality:

```typescript
// Example: tests/scan-service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ScanService } from '../src/application/services/scan-service';

describe('ScanService', () => {
  it('should detect R files in directory', async () => {
    // Arrange
    const mockSearcher = { search: vi.fn().mockResolvedValue(['file.R']) };
    const mockFs = { exists: vi.fn().mockReturnValue(true), ... };
    const service = new ScanService(mockSearcher, mockFs);
    
    // Act
    const result = await service.scan({ targetDir: '.', recursive: true });
    
    // Assert
    expect(result.files.rScripts.length).toBeGreaterThan(0);
  });
});
```

## Step 2: Evaluation Criteria

### Variables (15%)
- [ ] Meaningful and pronounceable names
- [ ] Consistent vocabulary
- [ ] Searchable names (no magic numbers)
- [ ] Explanatory variables
- [ ] No single-letter variables
- [ ] No redundant context
- [ ] Default parameters used

### Functions (25%)
- [ ] 2 or fewer arguments (or use object destructuring)
- [ ] Single responsibility
- [ ] Descriptive names
- [ ] Single abstraction level
- [ ] No duplicate code (DRY)
- [ ] No flag parameters
- [ ] No side effects
- [ ] Encapsulated conditionals

### Classes (20%)
- [ ] ES6 class syntax
- [ ] Private members for internals
- [ ] Method chaining where appropriate
- [ ] Small, focused classes

### SOLID (20%)
- [ ] Single Responsibility
- [ ] Open/Closed
- [ ] Liskov Substitution
- [ ] Interface Segregation
- [ ] Dependency Inversion

### Error Handling (10%)
- [ ] No silent failures
- [ ] Specific error messages
- [ ] Custom error types
- [ ] Promise rejections handled

### Async/Await (5%)
- [ ] Async/await over callbacks
- [ ] Promise.all for parallel ops
- [ ] Proper error handling

### Comments (5%)
- [ ] Self-documenting code
- [ ] No commented-out code
- [ ] JSDoc for public APIs

## Step 3: Common Fixes

### Fix 1: Extract Magic Numbers
```typescript
// Before
setTimeout(fn, 86400000);

// After
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
setTimeout(fn, MILLISECONDS_PER_DAY);
```

### Fix 2: Object Destructuring for Parameters
```typescript
// Before
function createUser(name, email, age, isAdmin) { }

// After
function createUser({ name, email, age, isAdmin }: CreateUserOptions) { }
```

### Fix 3: Custom Error Classes
```typescript
// Before
throw new Error(`Directory not found: ${path}`);

// After
throw new DirectoryNotFoundError(path);
```

### Fix 4: Split Large Functions
```typescript
// Before: 100+ line function

// After
function processData(data) {
  const validated = validateData(data);
  const transformed = transformData(validated);
  return formatOutput(transformed);
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

After completing the review and fixes:

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

## Quick Command

To trigger this skill, say:

> "Run TypeScript Clean Code review on [file/directory], fix issues, and verify with tests"

The agent will:
1. Write/verify tests exist
2. Run baseline tests
3. Evaluate against checklist
4. Apply fixes
5. Run tests again
6. Generate report
