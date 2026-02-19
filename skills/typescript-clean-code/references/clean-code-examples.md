# Clean Code Fix Examples

Common before/after patterns for fixing TypeScript code quality issues.

## Fix 1: Extract Magic Numbers

```typescript
// Before
setTimeout(fn, 86400000);

// After
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
setTimeout(fn, MILLISECONDS_PER_DAY);
```

## Fix 2: Object Destructuring for Parameters

```typescript
// Before
function createUser(name, email, age, isAdmin) { }

// After
function createUser({ name, email, age, isAdmin }: CreateUserOptions) { }
```

## Fix 3: Custom Error Classes

```typescript
// Before
throw new Error(`Directory not found: ${path}`);

// After
throw new DirectoryNotFoundError(path);
```

## Fix 4: Split Large Functions

```typescript
// Before: 100+ line function

// After
function processData(data) {
  const validated = validateData(data);
  const transformed = transformData(validated);
  return formatOutput(transformed);
}
```

## Fix 5: Write Tests Before Changes

```typescript
// Example: tests/scan-service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ScanService } from '../src/application/services/scan-service';

describe('ScanService', () => {
  it('should detect R files in directory', async () => {
    // Arrange
    const mockSearcher = { search: vi.fn().mockResolvedValue(['file.R']) };
    const mockFs = { exists: vi.fn().mockReturnValue(true) };
    const service = new ScanService(mockSearcher, mockFs);

    // Act
    const result = await service.scan({ targetDir: '.', recursive: true });

    // Assert
    expect(result.files.rScripts.length).toBeGreaterThan(0);
  });
});
```
