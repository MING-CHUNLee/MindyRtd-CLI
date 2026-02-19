# Cross-Platform Compatibility Guide

Ensuring your code works on Windows, macOS, and Linux.

## Overview

This guide covers common cross-platform pitfalls and best practices for writing code that works across all three major operating systems.

## Platform Detection

### Using `process.platform`

```typescript
const PLATFORM = process.platform;
// Values: 'win32' (Windows), 'darwin' (macOS), 'linux' (Linux)
```

### Platform-Specific Logic

**✅ Good Example:**
```typescript
const PLATFORM = process.platform;

export const PLATFORM_CONFIG = {
  rExecutable: PLATFORM === 'win32' ? 'R.exe' : 'R',
  rscriptExecutable: PLATFORM === 'win32' ? 'Rscript.exe' : 'Rscript',
  homeDir: PLATFORM === 'win32' ? process.env.USERPROFILE : process.env.HOME,
  pathSeparator: PLATFORM === 'win32' ? ';' : ':',
};
```

**❌ Bad Example:**
```typescript
// ❌ Assumes Unix-like system
const rExecutable = 'R';
const homeDir = process.env.HOME;
```

## Path Handling

### Use `path.join()` and `path.resolve()`

**✅ Good Example:**
```typescript
import path from 'path';

// Joining paths
const filePath = path.join(projectDir, 'R', 'utils.R'); // Works on all platforms

// Resolving absolute paths
const absolutePath = path.resolve('.', 'data'); // Works on all platforms

// Getting directory name
const dirName = path.dirname(filePath);

// Getting file extension
const ext = path.extname(filePath); // '.R'
```

**❌ Bad Example:**
```typescript
// ❌ Hardcoded Unix separators
const filePath = projectDir + '/R/utils.R';

// ❌ Hardcoded Windows separators
const filePath2 = projectDir + '\\R\\utils.R';

// ❌ Hardcoded absolute path
const absolutePath = '/usr/local/data';
```

### Path Separators

**✅ Good Example:**
```typescript
import path from 'path';

// Use path.sep for platform-specific separator
const sep = path.sep; // '\\' on Windows, '/' on Unix

// Use path.delimiter for PATH separator
const pathDelimiter = path.delimiter; // ';' on Windows, ':' on Unix
```

## Environment Variables

### User Home Directory

**✅ Good Example:**
```typescript
import os from 'os';

// ✅ Best: Use os.homedir() (works on all platforms)
const homeDir = os.homedir();

// ✅ Alternative: Platform-specific env vars
const homeDir2 = process.platform === 'win32'
  ? process.env.USERPROFILE
  : process.env.HOME;
```

**❌ Bad Example:**
```typescript
// ❌ Only works on Unix
const homeDir = process.env.HOME;

// ❌ Only works on Windows
const homeDir2 = process.env.USERPROFILE;
```

### Temp Directory

**✅ Good Example:**
```typescript
import os from 'os';

// ✅ Use os.tmpdir() (works on all platforms)
const tempDir = os.tmpdir();
```

**❌ Bad Example:**
```typescript
// ❌ Unix-only
const tempDir = '/tmp';

// ❌ Windows-only
const tempDir2 = 'C:\\Temp';
```

### Environment Variable Names

**✅ Good Example:**
```typescript
// ✅ Consistent naming across platforms
const apiKey = process.env.API_KEY;
const llmModel = process.env.LLM_MODEL;
```

**❌ Bad Example:**
```typescript
// ❌ Platform-specific variable names
const apiKey = process.platform === 'win32'
  ? process.env.API_KEY_WINDOWS
  : process.env.API_KEY_UNIX;
```

## Executable Names

### R and Rscript

**✅ Good Example:**
```typescript
const PLATFORM = process.platform;

const R_EXECUTABLE = PLATFORM === 'win32' ? 'R.exe' : 'R';
const RSCRIPT_EXECUTABLE = PLATFORM === 'win32' ? 'Rscript.exe' : 'Rscript';

// Usage
import { spawn } from 'child_process';

const process = spawn(R_EXECUTABLE, ['--version']);
```

**❌ Bad Example:**
```typescript
// ❌ Doesn't work on Windows
const process = spawn('R', ['--version']);
```

### Finding Executables

**✅ Good Example:**
```typescript
import { execSync } from 'child_process';

/**
 * Find executable path using platform-specific command.
 */
function findExecutable(name: string): string | null {
  try {
    const command = process.platform === 'win32' ? 'where' : 'which';
    const result = execSync(`${command} ${name}`, { encoding: 'utf-8' });
    return result.trim().split('\n')[0]; // First match
  } catch {
    return null; // Not found
  }
}

// Usage
const rPath = findExecutable(PLATFORM === 'win32' ? 'R.exe' : 'R');
```

## File System Operations

### Checking File Existence

**✅ Good Example:**
```typescript
import fs from 'fs/promises';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false; // ✅ Handles ENOENT gracefully
  }
}
```

**❌ Bad Example:**
```typescript
// ❌ Sync operation, throws on error
function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath); // Discouraged by Node.js docs
}
```

### Reading Directories

**✅ Good Example:**
```typescript
import fs from 'fs/promises';
import path from 'path';

async function readDirectory(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isFile())
      .map(entry => path.join(dirPath, entry.name)); // ✅ Cross-platform path join
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new DirectoryNotFoundError(dirPath);
    }
    throw error;
  }
}
```

### Newline Handling

**✅ Good Example:**
```typescript
import os from 'os';

// ✅ Use os.EOL for platform-specific newlines
const content = `Line 1${os.EOL}Line 2${os.EOL}Line 3`;

// ✅ Alternative: Use '\n' and let Node.js handle it
const content2 = 'Line 1\nLine 2\nLine 3'; // Works on all platforms
```

**❌ Bad Example:**
```typescript
// ❌ Hardcoded Windows newlines
const content = 'Line 1\r\nLine 2\r\nLine 3';
```

## Shell Command Execution

### Using `spawn` vs `exec`

**✅ Good Example:**
```typescript
import { spawn } from 'child_process';

// ✅ Use spawn for better cross-platform support
const process = spawn(R_EXECUTABLE, ['--version'], {
  shell: false, // Don't use shell (more portable)
});

process.stdout.on('data', (data) => {
  console.log(data.toString());
});
```

**When to use `shell: true`:**
```typescript
import { spawn } from 'child_process';

// ✅ Use shell only when necessary (e.g., piping, wildcards)
const process = spawn('echo', ['hello'], {
  shell: true, // Required for shell features
  // On Windows, uses cmd.exe; on Unix, uses /bin/sh
});
```

**❌ Bad Example:**
```typescript
import { exec } from 'child_process';

// ❌ Assumes Unix shell syntax
exec('ls -la | grep .R', (error, stdout) => {
  // Doesn't work on Windows
});
```

## Common Pitfalls

### 1. Hardcoded Paths

**❌ Problematic:**
```typescript
const configPath = '/usr/local/etc/config.json'; // Unix-only
const configPath2 = 'C:\\Users\\config.json'; // Windows-only
```

**✅ Better:**
```typescript
import path from 'path';
import os from 'os';

const configPath = path.join(os.homedir(), '.config', 'app', 'config.json');
```

### 2. Assuming Case-Sensitive File Systems

**❌ Problematic:**
```typescript
// macOS/Linux: case-sensitive
// Windows: case-insensitive

fs.readFileSync('Config.json'); // May fail on some systems
```

**✅ Better:**
```typescript
// Always use consistent casing
fs.readFileSync('config.json'); // Lowercase

// Or normalize case
const normalizedPath = path.normalize(filePath).toLowerCase();
```

### 3. Line Ending Issues in Git

**✅ Best Practice:**
```gitattributes
# .gitattributes
* text=auto
*.js text eol=lf
*.ts text eol=lf
*.json text eol=lf
*.md text eol=lf
```

### 4. Permission Issues

**❌ Problematic:**
```typescript
// Unix: chmod needed for execute
fs.chmodSync('script.sh', 0o755);
```

**✅ Better:**
```typescript
// Use Node.js to run scripts (no chmod needed)
spawn('node', ['script.js']);

// Or check platform first
if (process.platform !== 'win32') {
  fs.chmodSync('script.sh', 0o755);
}
```

## Testing Cross-Platform Code

### Use Vitest with Platform-Agnostic Assertions

**✅ Good Example:**
```typescript
import { describe, it, expect } from 'vitest';
import path from 'path';

describe('FileScanner', () => {
  it('should return paths with correct separators', () => {
    const result = scanFiles('.');

    // ✅ Use toContain for partial matches
    expect(result.files).toContain('file.R');

    // ✅ Or normalize paths for comparison
    const normalized = result.files.map(f => path.normalize(f));
    expect(normalized).toContain(path.normalize('path/to/file.R'));
  });
});
```

**❌ Bad Example:**
```typescript
describe('FileScanner', () => {
  it('should return Unix paths', () => {
    const result = scanFiles('.');

    // ❌ Assumes Unix path separators
    expect(result.files[0]).toBe('path/to/file.R');
  });
});
```

### Mock Platform Detection

**✅ Good Example:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Platform-specific behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should use R.exe on Windows', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    const executable = getRExecutable();
    expect(executable).toBe('R.exe');
  });

  it('should use R on Unix', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');

    const executable = getRExecutable();
    expect(executable).toBe('R');
  });
});
```

## Platform-Specific Library Paths

### R Library Locations

**✅ Good Example:**
```typescript
const PLATFORM = process.platform;

export const R_LIBRARY_PATHS = {
  win32: [
    path.join(process.env.USERPROFILE || '', 'Documents', 'R', 'win-library'),
    path.join('C:', 'Program Files', 'R', 'R-*', 'library'),
  ],
  darwin: [
    path.join(os.homedir(), 'Library', 'R'),
    '/Library/Frameworks/R.framework/Resources/library',
  ],
  linux: [
    path.join(os.homedir(), 'R'),
    '/usr/local/lib/R/site-library',
    '/usr/lib/R/library',
  ],
};

export function getRLibraryPaths(): string[] {
  return R_LIBRARY_PATHS[PLATFORM] || [];
}
```

## Summary Checklist

Before committing code, verify:

- [ ] ✅ Use `path.join()` / `path.resolve()` for all path operations
- [ ] ✅ Use `process.platform` for platform detection
- [ ] ✅ Executable names account for `.exe` on Windows
- [ ] ✅ Environment variables use cross-platform names
- [ ] ✅ Use `os.homedir()` instead of env vars
- [ ] ✅ Use `os.tmpdir()` for temp directory
- [ ] ✅ Handle file system errors (ENOENT) gracefully
- [ ] ✅ Tests use platform-agnostic assertions
- [ ] ✅ No hardcoded paths or separators
- [ ] ✅ Newlines use `os.EOL` or `\n` (let Node.js handle it)

## Resources

- [Node.js Path Module](https://nodejs.org/api/path.html)
- [Node.js OS Module](https://nodejs.org/api/os.html)
- [Node.js Process Platform](https://nodejs.org/api/process.html#processplatform)
- [Writing Cross-Platform Node.js](https://shapeshed.com/writing-cross-platform-node/)
