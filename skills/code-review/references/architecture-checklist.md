# Architecture Checklist

A comprehensive checklist for architecture-level code reviews.

## Quick Reference

Use this checklist when reviewing code changes to ensure architectural compliance.

## Layer Placement Check

### Controller Layer (`commands/`, `controllers/`)

- [ ] **Commands** only handle CLI interaction (parsing args, calling services)
- [ ] **Controllers** only handle external API communication
- [ ] No business logic in controllers
- [ ] No file system operations in controllers
- [ ] No data transformation (beyond input validation)
- [ ] Error handling delegates to services

**✅ Good Example:**
```typescript
// commands/scan.ts
export const scanCommand = new Command('scan')
  .option('-r, --recursive', 'Scan recursively')
  .action(async (options) => {
    const result = await fileScanner.scan(options); // ✅ Delegate to service
    displayScanResult(result); // ✅ Delegate to view
  });
```

**❌ Bad Example:**
```typescript
// commands/scan.ts
export const scanCommand = new Command('scan')
  .action(async (options) => {
    const files = fs.readdirSync('.'); // ❌ Direct file I/O
    const filtered = files.filter(f => f.endsWith('.R')); // ❌ Business logic
    console.log(`Found: ${filtered.length}`); // ❌ View logic
  });
```

### Model Layer (`services/`, `types/`)

- [ ] **Services** contain reusable business logic
- [ ] **Services** orchestrate multiple operations
- [ ] **Services** have no I/O dependencies (use dependency injection)
- [ ] **Types** are pure definitions (no logic)
- [ ] **Types** are exported from `types/index.ts` barrel file
- [ ] Factory functions use `createXxx` naming convention

**✅ Good Example:**
```typescript
// services/library-scanner.ts
export class LibraryScanner {
  constructor(private fs: FileSystem) {} // ✅ Dependency injection

  scan(projectPath: string): LibraryInfo[] {
    const packages = this.detectPackages(projectPath); // ✅ Business logic
    return packages.map(pkg => this.enrichWithCapabilities(pkg));
  }
}

// types/library-info.ts
export interface LibraryInfo {
  name: string;
  version: string;
  capabilities: string[];
}

export function createLibraryInfo(name: string, version: string): LibraryInfo {
  return { name, version, capabilities: [] };
}
```

**❌ Bad Example:**
```typescript
// services/library-scanner.ts
export class LibraryScanner {
  scan(projectPath: string): void {
    const packages = this.detectPackages(projectPath);
    console.log(`Found: ${packages.length}`); // ❌ View logic in service
    displayPackages(packages); // ❌ Service calling view directly
  }
}
```

### View Layer (`views/`, `templates/`)

- [ ] **Views** only handle output formatting
- [ ] **Views** have no business logic
- [ ] **Views** have no data fetching
- [ ] **Templates** are pure functions (no side effects)
- [ ] i18n uses `locale-loader.ts`
- [ ] Prompts use `section-builders.ts` for composition

**✅ Good Example:**
```typescript
// views/scan-result.ts
export function displayScanResult(result: ScanResult): void {
  console.log(chalk.bold('\nScan Results:'));
  console.log(`R Scripts: ${result.files.rScripts.length}`); // ✅ Formatting only
}

// templates/prompts/section-builders.ts
export function buildProjectSection(project: ProjectInfo): string {
  return `Project: ${project.name}\nVersion: ${project.version}`; // ✅ Pure function
}
```

**❌ Bad Example:**
```typescript
// views/scan-result.ts
export function displayScanResult(projectPath: string): void {
  const files = fs.readdirSync(projectPath); // ❌ Data fetching in view
  const rFiles = files.filter(f => f.endsWith('.R')); // ❌ Business logic
  console.log(`Found: ${rFiles.length}`);
}
```

### Infrastructure Layer (`config/`, `data/`, `utils/`)

- [ ] **Config** uses environment variables (12-Factor App)
- [ ] **Config** has sensible defaults
- [ ] **Data** contains static/reference data only
- [ ] **Utils** are pure helper functions
- [ ] **Error classes** extend Error with custom properties

**✅ Good Example:**
```typescript
// config/index.ts
export const config = {
  llm: {
    provider: process.env.LLM_PROVIDER || 'anthropic', // ✅ Env var with default
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  },
};

// utils/errors.ts
export class DirectoryNotFoundError extends Error {
  constructor(public readonly path: string) { // ✅ Custom property
    super(`Directory not found: ${path}`);
    this.name = 'DirectoryNotFoundError';
  }
}
```

**❌ Bad Example:**
```typescript
// config/index.ts
export const config = {
  llm: {
    provider: 'anthropic', // ❌ Hardcoded, no env var
    apiKey: 'sk-ant-xxxxx', // ❌ Hardcoded secret
  },
};
```

## Dependency Flow Check

### Allowed Dependencies

```
✅ commands/    → services/, views/, types/
✅ controllers/ → config/, types/
✅ services/    → types/, utils/
✅ views/       → types/, utils/
✅ types/       → (nothing, pure definitions)
✅ utils/       → types/
```

### Forbidden Dependencies

```
❌ services/    → views/     (services should not know about output)
❌ services/    → commands/  (services should not know about CLI)
❌ views/       → services/  (views should not fetch data)
❌ types/       → anything   (types should be pure)
❌ utils/       → services/  (utils should be reusable)
```

**Check:**
- [ ] No circular dependencies
- [ ] Dependencies flow in one direction (commands → services → types)
- [ ] Views don't import from services
- [ ] Services don't import from views or commands

## Cross-Platform Compatibility Check

### Path Handling

- [ ] Use `path.join()` instead of string concatenation
- [ ] Use `path.resolve()` for absolute paths
- [ ] Use `path.sep` instead of hardcoded `/` or `\`
- [ ] No hardcoded Windows paths (`C:\Users\...`)
- [ ] No hardcoded Unix paths (`/usr/local/...`)

**✅ Good Example:**
```typescript
import path from 'path';

const filePath = path.join(projectDir, 'R', 'utils.R'); // ✅ Cross-platform
const absolutePath = path.resolve('.', 'data'); // ✅ Cross-platform
```

**❌ Bad Example:**
```typescript
const filePath = projectDir + '/R/utils.R'; // ❌ Unix-only
const absolutePath = 'C:\\Users\\data'; // ❌ Windows-only
```

### Platform Detection

- [ ] Use `process.platform` for platform-specific logic
- [ ] Handle all three platforms: `win32`, `darwin`, `linux`
- [ ] Executable names account for `.exe` on Windows

**✅ Good Example:**
```typescript
const PLATFORM = process.platform;

const rExecutable = PLATFORM === 'win32' ? 'R.exe' : 'R'; // ✅ Platform-aware

const homeDir = PLATFORM === 'win32'
  ? process.env.USERPROFILE
  : process.env.HOME; // ✅ Handles all platforms
```

**❌ Bad Example:**
```typescript
const rExecutable = 'R'; // ❌ Doesn't work on Windows
const homeDir = process.env.HOME; // ❌ Undefined on Windows
```

### File System Operations

- [ ] Check file existence before operations
- [ ] Handle ENOENT errors gracefully
- [ ] Use cross-platform newlines (`\n` or `os.EOL`)
- [ ] Test on all three platforms if possible

## Testing Check

### Test File Organization

- [ ] Tests in `tests/` directory
- [ ] Test files use `.test.ts` suffix
- [ ] One test file per source file (matching names)
- [ ] Tests use Vitest framework

### Test Quality

- [ ] Arrange-Act-Assert pattern
- [ ] Descriptive test names (`should detect R files in directory`)
- [ ] External dependencies mocked (fs, child_process, API calls)
- [ ] Cross-platform test assertions (use `toContain()` not exact paths)

**✅ Good Example:**
```typescript
// tests/file-scanner.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('FileScanner', () => {
  it('should detect R files in directory', async () => {
    // Arrange
    const mockFs = { readdir: vi.fn().mockResolvedValue(['file.R']) };
    const scanner = new FileScanner(mockFs);

    // Act
    const result = await scanner.scan('.');

    // Assert
    expect(result.files.rScripts).toContain('file.R'); // ✅ Cross-platform
  });
});
```

**❌ Bad Example:**
```typescript
describe('FileScanner', () => {
  it('test1', async () => { // ❌ Non-descriptive name
    const scanner = new FileScanner(); // ❌ No mocking (will hit real filesystem)
    const result = await scanner.scan('.');
    expect(result.files.rScripts[0]).toBe('C:\\Users\\file.R'); // ❌ Windows-specific
  });
});
```

## Documentation Check

### Code Documentation

- [ ] Public APIs have JSDoc comments
- [ ] Complex logic has inline comments explaining "why" (not "what")
- [ ] No commented-out code (use git history)
- [ ] Type definitions are self-documenting

**✅ Good Example:**
```typescript
/**
 * Scans a directory for R-related files.
 *
 * @param options - Scan configuration options
 * @returns Structured scan result with categorized files
 * @throws {DirectoryNotFoundError} If target directory doesn't exist
 */
export async function scan(options: ScanOptions): Promise<ScanResult> {
  // Use absolute path to handle symlinks correctly
  const absolutePath = path.resolve(options.targetDir);
  // ...
}
```

**❌ Bad Example:**
```typescript
// This function scans files
export async function scan(options: any) { // ❌ No JSDoc, 'any' type
  // Loop through files
  for (const file of files) { // ❌ Comments state the obvious
    // Check if file is R script
    if (file.endsWith('.R')) {
      // ...
    }
  }
}
```

### Project Documentation

- [ ] `IMPLEMENTATION_PLAN.md` updated if architecture changed
- [ ] Directives updated if behavior changed
- [ ] README updated if CLI interface changed

## Naming Conventions

### Files and Directories

- [ ] Lowercase with hyphens (`file-scanner.ts`, not `FileScanner.ts`)
- [ ] Descriptive names that match content
- [ ] Test files match source files (`file-scanner.test.ts`)

### Code

- [ ] PascalCase for classes/interfaces (`FileScanner`, `LibraryInfo`)
- [ ] camelCase for functions/variables (`scanFiles`, `projectPath`)
- [ ] UPPER_SNAKE_CASE for constants (`MAX_FILE_SIZE`, `DEFAULT_TIMEOUT`)
- [ ] Factory functions use `createXxx` prefix

## Summary Checklist

Before approving any code change, verify:

- [ ] ✅ Code is in the correct directory for its responsibility
- [ ] ✅ Dependencies flow in the correct direction
- [ ] ✅ Cross-platform compatible (paths, executables, env vars)
- [ ] ✅ Tests exist and pass
- [ ] ✅ Code is self-documenting with JSDoc for public APIs
- [ ] ✅ Follows naming conventions
- [ ] ✅ No business logic in controllers/views
- [ ] ✅ No I/O dependencies in services (use DI)
- [ ] ✅ Error handling is appropriate

If all checks pass: **✅ Approved**
If some checks fail: **⚠️ Approved with suggestions** or **❌ Needs changes**
