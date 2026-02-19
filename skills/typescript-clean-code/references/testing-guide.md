# Testing Guide for Clean Code Reviews

How to write tests before and after Clean Code refactoring.

## Overview

Before making any Clean Code improvements, you **must** write tests to ensure functionality doesn't break. This guide shows you how.

## Testing Framework

We use **Vitest** for all tests.

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test File Organization

```
tests/
├── file-scanner.test.ts      # Tests for src/services/file-scanner.ts
├── library-scanner.test.ts   # Tests for src/services/library-scanner.ts
├── types.test.ts             # Tests for src/types/*.ts
├── errors.test.ts            # Tests for src/utils/errors.ts
└── ...
```

**Naming convention:** `<source-file>.test.ts`

## Writing Tests Before Refactoring

### Step 1: Identify Functionality

Before refactoring, ask:
- What does this code do?
- What are the inputs and outputs?
- What are the edge cases?

### Step 2: Write Baseline Tests

**Example: Testing a file scanner**

```typescript
// tests/file-scanner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileScanner } from '../src/services/file-scanner';
import type { ScanOptions } from '../src/types';

describe('FileScanner', () => {
  let mockFs: any;
  let scanner: FileScanner;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Create mock file system
    mockFs = {
      readdir: vi.fn(),
      stat: vi.fn(),
      access: vi.fn(),
    };

    // Create scanner with mock dependencies
    scanner = new FileScanner(mockFs);
  });

  describe('scan()', () => {
    it('should detect R script files', async () => {
      // Arrange
      mockFs.readdir.mockResolvedValue(['file1.R', 'file2.R', 'README.md']);
      mockFs.stat.mockResolvedValue({ isFile: () => true });
      mockFs.access.mockResolvedValue(undefined);

      // Act
      const result = await scanner.scan({ targetDir: '.' });

      // Assert
      expect(result.files.rScripts).toHaveLength(2);
      expect(result.files.rScripts).toContain('file1.R');
      expect(result.files.rScripts).toContain('file2.R');
    });

    it('should handle empty directories', async () => {
      // Arrange
      mockFs.readdir.mockResolvedValue([]);

      // Act
      const result = await scanner.scan({ targetDir: '.' });

      // Assert
      expect(result.files.rScripts).toHaveLength(0);
    });

    it('should throw DirectoryNotFoundError for non-existent directory', async () => {
      // Arrange
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      // Act & Assert
      await expect(scanner.scan({ targetDir: '/invalid' }))
        .rejects
        .toThrow(DirectoryNotFoundError);
    });
  });
});
```

### Step 3: Run Tests (Baseline)

```bash
npm test
```

All tests should **pass** before refactoring.

## Testing Patterns

### Pattern 1: Arrange-Act-Assert (AAA)

```typescript
it('should format date correctly', () => {
  // Arrange - Set up test data
  const date = new Date('2026-02-19');

  // Act - Execute the function
  const result = formatDate(date);

  // Assert - Verify the result
  expect(result).toBe('2026-02-19');
});
```

### Pattern 2: Mocking External Dependencies

**File system:**
```typescript
import { vi } from 'vitest';
import fs from 'fs/promises';

// Mock the entire module
vi.mock('fs/promises');

it('should read file content', async () => {
  // Arrange
  vi.mocked(fs.readFile).mockResolvedValue('file content');

  // Act
  const content = await readConfigFile('config.json');

  // Assert
  expect(content).toBe('file content');
  expect(fs.readFile).toHaveBeenCalledWith('config.json', 'utf-8');
});
```

**Child process:**
```typescript
import { vi } from 'vitest';
import { execSync } from 'child_process';

vi.mock('child_process');

it('should execute R command', () => {
  // Arrange
  vi.mocked(execSync).mockReturnValue(Buffer.from('R version 4.3.0'));

  // Act
  const version = getRVersion();

  // Assert
  expect(version).toBe('4.3.0');
  expect(execSync).toHaveBeenCalledWith('R --version');
});
```

### Pattern 3: Testing Error Handling

```typescript
it('should throw ValidationError for invalid email', () => {
  // Arrange
  const invalidEmail = 'not-an-email';

  // Act & Assert
  expect(() => validateEmail(invalidEmail))
    .toThrow(ValidationError);

  expect(() => validateEmail(invalidEmail))
    .toThrow('Invalid email format: not-an-email');
});

it('should handle async errors', async () => {
  // Arrange
  const mockApi = vi.fn().mockRejectedValue(new Error('Network error'));

  // Act & Assert
  await expect(fetchData(mockApi))
    .rejects
    .toThrow('Network error');
});
```

### Pattern 4: Testing Async Functions

```typescript
it('should fetch user data asynchronously', async () => {
  // Arrange
  const mockFetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ id: 1, name: 'John' }),
  });

  // Act
  const user = await getUser(1, mockFetch);

  // Assert
  expect(user).toEqual({ id: 1, name: 'John' });
  expect(mockFetch).toHaveBeenCalledWith('/api/users/1');
});
```

### Pattern 5: Cross-Platform Testing

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('Platform-specific behavior', () => {
  it('should use R.exe on Windows', () => {
    // Arrange
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    // Act
    const executable = getRExecutable();

    // Assert
    expect(executable).toBe('R.exe');
  });

  it('should use R on Unix', () => {
    // Arrange
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');

    // Act
    const executable = getRExecutable();

    // Assert
    expect(executable).toBe('R');
  });

  it('should handle paths with correct separators', () => {
    // Arrange
    const result = buildPath('path', 'to', 'file.R');

    // Assert - Use toContain for partial matches (cross-platform)
    expect(result).toContain('file.R');

    // Or normalize paths for exact comparison
    const normalized = path.normalize(result);
    expect(normalized).toBe(path.normalize('path/to/file.R'));
  });
});
```

## Testing After Refactoring

### Step 1: Apply Clean Code Fixes

Refactor the code according to Clean Code principles.

### Step 2: Run Tests Again

```bash
npm test
```

**All tests must still pass.** If any test fails:
1. Review your changes
2. Fix the issue
3. Run tests again

### Step 3: Add New Tests if Needed

If you extracted new functions, add tests for them:

```typescript
// After extracting helper functions
describe('Helper functions', () => {
  it('isValidEmail should validate email format', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('invalid')).toBe(false);
  });

  it('getAgeGroup should categorize ages correctly', () => {
    expect(getAgeGroup(25)).toBe('young');
    expect(getAgeGroup(45)).toBe('middle');
    expect(getAgeGroup(70)).toBe('senior');
  });
});
```

## Test Coverage

### Checking Coverage

```bash
npm run test:coverage
```

**Expected output:**
```
--------------------|---------|----------|---------|---------|-------------------
File                | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
--------------------|---------|----------|---------|---------|-------------------
All files           |   85.23 |    78.45 |   90.12 |   85.23 |
 services/          |   92.15 |    85.34 |   95.00 |   92.15 |
  file-scanner.ts   |   95.00 |    90.00 |  100.00 |   95.00 | 42-45
  library-scanner.ts|   89.30 |    80.68 |   90.00 |   89.30 | 67-72, 98
 types/             |  100.00 |   100.00 |  100.00 |  100.00 |
--------------------|---------|----------|---------|---------|-------------------
```

### Coverage Goals

| Component | Minimum Coverage |
|-----------|------------------|
| Services | 85% |
| Types | 100% |
| Utils | 90% |
| Commands | 70% |

## Common Testing Pitfalls

### ❌ Pitfall 1: Testing Implementation Details

```typescript
// ❌ Bad - Tests internal implementation
it('should call validateEmail helper', () => {
  const spy = vi.spyOn(validator, 'validateEmail');
  createUser({ email: 'user@example.com' });
  expect(spy).toHaveBeenCalled(); // Implementation detail
});

// ✅ Good - Tests behavior
it('should create user with valid email', () => {
  const user = createUser({ email: 'user@example.com' });
  expect(user.email).toBe('user@example.com');
});
```

### ❌ Pitfall 2: Not Mocking External Dependencies

```typescript
// ❌ Bad - Hits real file system
it('should read file', async () => {
  const content = await fs.readFile('config.json', 'utf-8');
  expect(content).toContain('setting');
});

// ✅ Good - Mocks file system
it('should read file', async () => {
  vi.mocked(fs.readFile).mockResolvedValue('{"setting": "value"}');
  const content = await readConfigFile();
  expect(JSON.parse(content).setting).toBe('value');
});
```

### ❌ Pitfall 3: Platform-Specific Assertions

```typescript
// ❌ Bad - Assumes Unix paths
it('should return file path', () => {
  const path = getFilePath('dir', 'file.txt');
  expect(path).toBe('dir/file.txt'); // Fails on Windows
});

// ✅ Good - Cross-platform assertion
it('should return file path', () => {
  const result = getFilePath('dir', 'file.txt');
  expect(result).toContain('file.txt');
  // Or normalize for exact comparison
  expect(path.normalize(result)).toBe(path.normalize('dir/file.txt'));
});
```

## Test-Driven Refactoring Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  1. Write tests for existing functionality                  │
│     • Cover happy path                                       │
│     • Cover edge cases                                       │
│     • Cover error cases                                      │
├─────────────────────────────────────────────────────────────┤
│  2. Run tests → ALL PASS (baseline)                         │
│     • npm test                                               │
│     • Fix any failing tests before refactoring               │
├─────────────────────────────────────────────────────────────┤
│  3. Refactor code (apply Clean Code fixes)                  │
│     • Extract magic numbers                                  │
│     • Simplify functions                                     │
│     • Add type safety                                        │
├─────────────────────────────────────────────────────────────┤
│  4. Run tests → ALL PASS (verify)                           │
│     • npm test                                               │
│     • If any fail, fix and repeat                            │
├─────────────────────────────────────────────────────────────┤
│  5. Add tests for new functions (if extracted)              │
│     • Test new helper functions                              │
│     • Increase coverage                                      │
├─────────────────────────────────────────────────────────────┤
│  6. Run tests + coverage                                     │
│     • npm run test:coverage                                  │
│     • Ensure coverage didn't decrease                        │
└─────────────────────────────────────────────────────────────┘
```

## Quick Reference

### Essential Vitest Functions

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Test suite', () => {
  beforeEach(() => {
    // Runs before each test
  });

  afterEach(() => {
    // Runs after each test
  });

  it('test case', () => {
    // Test implementation
  });
});

// Assertions
expect(value).toBe(expected);             // Strict equality
expect(value).toEqual(expected);          // Deep equality
expect(value).toContain(item);            // Array/string contains
expect(value).toBeGreaterThan(n);         // Numeric comparison
expect(value).toBeTruthy();               // Truthy check
expect(value).toBeInstanceOf(Class);      // Type check
expect(() => fn()).toThrow(Error);        // Sync error
await expect(asyncFn()).rejects.toThrow(); // Async error

// Mocking
const mockFn = vi.fn();                    // Create mock
vi.mocked(module.fn).mockReturnValue(val); // Mock return value
vi.spyOn(obj, 'method');                   // Spy on method
vi.clearAllMocks();                        // Clear all mocks
```

## Summary

✅ **Always write tests before refactoring**
✅ **Use Arrange-Act-Assert pattern**
✅ **Mock external dependencies (fs, child_process, APIs)**
✅ **Test behavior, not implementation**
✅ **Make tests cross-platform**
✅ **Aim for > 85% coverage on business logic**
✅ **Run tests before AND after refactoring**
