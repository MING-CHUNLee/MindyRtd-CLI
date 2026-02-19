# Common Fixes Reference

Catalog of common Clean Code fixes with detailed before/after examples.

## Overview

This reference provides patterns for fixing the most common Clean Code violations in TypeScript projects.

## Fix 1: Extract Magic Numbers

### Problem
Hardcoded numbers without context make code hard to understand and maintain.

### Solution
Extract constants with descriptive names.

### Examples

**Example 1: Timeouts**
```typescript
// ❌ Before
setTimeout(checkStatus, 86400000);

// ✅ After
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
setTimeout(checkStatus, MILLISECONDS_PER_DAY);
```

**Example 2: File sizes**
```typescript
// ❌ Before
if (fileSize > 5242880) {
  throw new Error('File too large');
}

// ✅ After
const MAX_FILE_SIZE_MB = 5;
const BYTES_PER_MB = 1024 * 1024;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * BYTES_PER_MB;

if (fileSize > MAX_FILE_SIZE_BYTES) {
  throw new FileTooLargeError(fileSize, MAX_FILE_SIZE_BYTES);
}
```

**Example 3: Array indices**
```typescript
// ❌ Before
const city = address.split(',')[1];
const zipCode = address.split(',')[2];

// ✅ After
const ADDRESS_PARTS = {
  STREET: 0,
  CITY: 1,
  ZIP_CODE: 2,
} as const;

const parts = address.split(',');
const city = parts[ADDRESS_PARTS.CITY];
const zipCode = parts[ADDRESS_PARTS.ZIP_CODE];
```

---

## Fix 2: Object Destructuring for Parameters

### Problem
Functions with > 2 parameters are hard to call and maintain.

### Solution
Use object destructuring with typed interfaces.

### Examples

**Example 1: User creation**
```typescript
// ❌ Before
function createUser(name: string, email: string, age: number, isAdmin: boolean) {
  return { name, email, age, isAdmin };
}

createUser('John', 'john@example.com', 30, false); // Hard to remember order

// ✅ After
interface CreateUserOptions {
  name: string;
  email: string;
  age: number;
  isAdmin: boolean;
}

function createUser(options: CreateUserOptions): User {
  return {
    name: options.name,
    email: options.email,
    age: options.age,
    isAdmin: options.isAdmin,
  };
}

createUser({
  name: 'John',
  email: 'john@example.com',
  age: 30,
  isAdmin: false,
}); // Self-documenting
```

**Example 2: File scanning**
```typescript
// ❌ Before
function scanFiles(
  directory: string,
  recursive: boolean,
  includeHidden: boolean,
  maxDepth: number,
  extensions: string[]
) {
  // ...
}

// ✅ After
interface ScanOptions {
  directory: string;
  recursive?: boolean;
  includeHidden?: boolean;
  maxDepth?: number;
  extensions?: string[];
}

function scanFiles(options: ScanOptions): ScanResult {
  const {
    directory,
    recursive = false,
    includeHidden = false,
    maxDepth = 10,
    extensions = [],
  } = options;
  // ...
}

scanFiles({
  directory: '/path/to/dir',
  recursive: true,
  extensions: ['.ts', '.js'],
}); // Only specify what you need
```

---

## Fix 3: Custom Error Classes

### Problem
Generic `Error` objects don't provide enough context or type safety.

### Solution
Create domain-specific error classes with relevant data.

### Examples

**Example 1: File system errors**
```typescript
// ❌ Before
throw new Error(`Directory not found: ${path}`);

// ✅ After
class DirectoryNotFoundError extends Error {
  constructor(public readonly path: string) {
    super(`Directory not found: ${path}`);
    this.name = 'DirectoryNotFoundError';
  }
}

throw new DirectoryNotFoundError('/path/to/dir');

// Usage with type checking
try {
  // ...
} catch (error) {
  if (error instanceof DirectoryNotFoundError) {
    console.error(`Could not find directory: ${error.path}`);
  }
}
```

**Example 2: Validation errors**
```typescript
// ❌ Before
throw new Error(`Invalid email: ${email}`);

// ✅ After
class ValidationError extends Error {
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    message: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

class InvalidEmailError extends ValidationError {
  constructor(email: string) {
    super('email', email, `Invalid email format: ${email}`);
    this.name = 'InvalidEmailError';
  }
}

throw new InvalidEmailError('not-an-email');
```

**Example 3: API errors**
```typescript
// ❌ Before
throw new Error('API request failed');

// ✅ After
class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly endpoint: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class NotFoundError extends ApiError {
  constructor(endpoint: string, resourceId: string) {
    super(404, endpoint, `Resource not found: ${resourceId} at ${endpoint}`);
    this.name = 'NotFoundError';
  }
}

throw new NotFoundError('/api/users', 'user-123');
```

---

## Fix 4: Split Large Functions

### Problem
Functions that do too much are hard to understand, test, and maintain.

### Solution
Extract smaller functions with single responsibilities.

### Examples

**Example 1: Data processing pipeline**
```typescript
// ❌ Before (100+ lines)
function processUserData(rawData: string): ProcessedUser[] {
  // Parse JSON
  const data = JSON.parse(rawData);

  // Validate each user
  const validUsers = [];
  for (const user of data) {
    if (user.email && user.email.includes('@')) {
      if (user.age && user.age >= 18) {
        validUsers.push(user);
      }
    }
  }

  // Transform data
  const transformed = validUsers.map(user => ({
    fullName: `${user.firstName} ${user.lastName}`,
    email: user.email.toLowerCase(),
    ageGroup: user.age < 30 ? 'young' : user.age < 60 ? 'middle' : 'senior',
  }));

  // Sort and deduplicate
  const sorted = transformed.sort((a, b) => a.email.localeCompare(b.email));
  const unique = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || sorted[i].email !== sorted[i - 1].email) {
      unique.push(sorted[i]);
    }
  }

  return unique;
}

// ✅ After (each function < 10 lines)
interface RawUser {
  firstName: string;
  lastName: string;
  email: string;
  age: number;
}

interface ProcessedUser {
  fullName: string;
  email: string;
  ageGroup: 'young' | 'middle' | 'senior';
}

function parseRawData(rawData: string): RawUser[] {
  return JSON.parse(rawData);
}

function isValidEmail(email: string): boolean {
  return email && email.includes('@');
}

function isAdult(age: number): boolean {
  return age >= 18;
}

function isValidUser(user: RawUser): boolean {
  return isValidEmail(user.email) && isAdult(user.age);
}

function getAgeGroup(age: number): 'young' | 'middle' | 'senior' {
  if (age < 30) return 'young';
  if (age < 60) return 'middle';
  return 'senior';
}

function transformUser(user: RawUser): ProcessedUser {
  return {
    fullName: `${user.firstName} ${user.lastName}`,
    email: user.email.toLowerCase(),
    ageGroup: getAgeGroup(user.age),
  };
}

function deduplicateByEmail(users: ProcessedUser[]): ProcessedUser[] {
  const seen = new Set<string>();
  return users.filter(user => {
    if (seen.has(user.email)) {
      return false;
    }
    seen.add(user.email);
    return true;
  });
}

function processUserData(rawData: string): ProcessedUser[] {
  const parsed = parseRawData(rawData);
  const validated = parsed.filter(isValidUser);
  const transformed = validated.map(transformUser);
  const sorted = transformed.sort((a, b) => a.email.localeCompare(b.email));
  return deduplicateByEmail(sorted);
}
```

---

## Fix 5: Remove Flag Parameters

### Problem
Boolean flags indicate a function does more than one thing.

### Solution
Split into separate functions.

### Examples

**Example 1: File creation**
```typescript
// ❌ Before
function createFile(name: string, temp: boolean) {
  if (temp) {
    fs.writeFileSync(`./temp/${name}`, '');
  } else {
    fs.writeFileSync(name, '');
  }
}

createFile('config.json', false);
createFile('cache.json', true);

// ✅ After
function createFile(name: string): void {
  fs.writeFileSync(name, '');
}

function createTempFile(name: string): void {
  createFile(`./temp/${name}`);
}

createFile('config.json');
createTempFile('cache.json');
```

**Example 2: Data formatting**
```typescript
// ❌ Before
function formatDate(date: Date, withTime: boolean): string {
  if (withTime) {
    return date.toISOString();
  } else {
    return date.toISOString().split('T')[0];
  }
}

// ✅ After
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDateTime(date: Date): string {
  return date.toISOString();
}
```

---

## Fix 6: Encapsulate Conditionals

### Problem
Complex conditionals are hard to read and understand.

### Solution
Extract conditionals into named functions.

### Examples

**Example 1: State checks**
```typescript
// ❌ Before
if (fsm.state === 'fetching' && isEmpty(listNode)) {
  // show spinner
}

// ✅ After
function shouldShowSpinner(fsm: FSM, listNode: Node): boolean {
  return fsm.state === 'fetching' && isEmpty(listNode);
}

if (shouldShowSpinner(fsmInstance, listNodeInstance)) {
  // show spinner
}
```

**Example 2: Permission checks**
```typescript
// ❌ Before
if (user.role === 'admin' || (user.role === 'moderator' && user.verified)) {
  // allow action
}

// ✅ After
function canPerformAction(user: User): boolean {
  return user.role === 'admin' || (user.role === 'moderator' && user.verified);
}

if (canPerformAction(user)) {
  // allow action
}
```

---

## Fix 7: Async/Await over Callbacks

### Problem
Callback-based code is hard to read and maintain (callback hell).

### Solution
Use modern async/await syntax.

### Examples

**Example 1: File operations**
```typescript
// ❌ Before
import fs from 'fs';

function readConfigFile(callback: (error: Error | null, data?: string) => void) {
  fs.readFile('config.json', 'utf-8', (err, data) => {
    if (err) {
      callback(err);
    } else {
      callback(null, data);
    }
  });
}

// ✅ After
import fs from 'fs/promises';

async function readConfigFile(): Promise<string> {
  return await fs.readFile('config.json', 'utf-8');
}
```

**Example 2: Multiple async operations**
```typescript
// ❌ Before (callback hell)
function getFullUserData(userId: string, callback: (error: Error | null, data?: UserData) => void) {
  getUser(userId, (err1, user) => {
    if (err1) return callback(err1);
    getPosts(user.id, (err2, posts) => {
      if (err2) return callback(err2);
      getComments(user.id, (err3, comments) => {
        if (err3) return callback(err3);
        callback(null, { user, posts, comments });
      });
    });
  });
}

// ✅ After (clean async/await)
async function getFullUserData(userId: string): Promise<UserData> {
  const user = await getUser(userId);
  const [posts, comments] = await Promise.all([
    getPosts(user.id),
    getComments(user.id),
  ]);
  return { user, posts, comments };
}
```

---

## Fix 8: Use Dependency Injection

### Problem
Tight coupling makes code hard to test and maintain.

### Solution
Inject dependencies through constructor or function parameters.

### Examples

**Example 1: Service with dependencies**
```typescript
// ❌ Before
class UserService {
  private database = new Database(); // ❌ Direct instantiation

  async getUser(id: string) {
    return this.database.query('SELECT * FROM users WHERE id = ?', [id]);
  }
}

// ✅ After
interface IDatabase {
  query(sql: string, params: unknown[]): Promise<unknown>;
}

class UserService {
  constructor(private database: IDatabase) {} // ✅ Dependency injection

  async getUser(id: string) {
    return this.database.query('SELECT * FROM users WHERE id = ?', [id]);
  }
}

// Usage
const database = new Database();
const userService = new UserService(database);

// Testing
const mockDatabase = { query: vi.fn() };
const testService = new UserService(mockDatabase);
```

---

## Fix 9: Remove Commented-Out Code

### Problem
Commented-out code clutters the codebase and causes confusion.

### Solution
Delete dead code. Use version control (git) for history.

### Examples

**Example 1: Dead code**
```typescript
// ❌ Before
function calculateTotal(items: Item[]): number {
  // const tax = 0.1;
  // const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  // return subtotal * (1 + tax);

  return items.reduce((sum, item) => sum + item.price, 0);
}

// ✅ After
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// If you need tax calculation later, implement it then
// Use git history to see previous implementations
```

---

## Fix 10: Add JSDoc to Public APIs

### Problem
Public APIs lack documentation, making them hard to use.

### Solution
Add comprehensive JSDoc comments.

### Examples

**Example 1: Function documentation**
```typescript
// ❌ Before
export function scan(options: ScanOptions): Promise<ScanResult> {
  // ...
}

// ✅ After
/**
 * Scans a directory for R-related files.
 *
 * This function recursively searches the target directory for files matching
 * common R project patterns (.R, .Rmd, .RData, etc.) and categorizes them.
 *
 * @param options - Configuration options for the scan
 * @param options.targetDir - Directory to scan (default: current directory)
 * @param options.recursive - Whether to scan subdirectories (default: false)
 * @param options.includeHidden - Whether to include hidden files (default: false)
 * @returns A structured result object with categorized file lists
 * @throws {DirectoryNotFoundError} If target directory doesn't exist
 * @throws {PermissionError} If directory is not readable
 *
 * @example
 * ```typescript
 * // Scan current directory non-recursively
 * const result = await scan({ targetDir: '.' });
 *
 * // Recursive scan with hidden files
 * const result = await scan({
 *   targetDir: '/path/to/project',
 *   recursive: true,
 *   includeHidden: true,
 * });
 *
 * console.log(`Found ${result.files.rScripts.length} R scripts`);
 * ```
 */
export async function scan(options: ScanOptions): Promise<ScanResult> {
  // ...
}
```

---

## Quick Reference

| Issue | Fix | Priority |
|-------|-----|----------|
| Magic numbers | Extract constants | High |
| Too many params | Object destructuring | High |
| Generic errors | Custom error classes | High |
| Large functions | Extract smaller functions | High |
| Flag parameters | Split into separate functions | Medium |
| Complex conditionals | Encapsulate in named functions | Medium |
| Callbacks | Use async/await | Medium |
| Tight coupling | Dependency injection | Medium |
| Commented code | Delete it | Low |
| Missing JSDoc | Add documentation | Low |

## Testing After Fixes

After applying fixes, always:

1. ✅ Run tests: `npm test`
2. ✅ Verify all tests pass
3. ✅ Check test coverage hasn't decreased
4. ✅ Run linter: `npm run lint`
5. ✅ Build project: `npm run build`

If any step fails, review the fix and adjust.
