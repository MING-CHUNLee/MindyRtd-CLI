# Clean Code Checklist

Complete evaluation criteria for TypeScript/JavaScript Clean Code reviews.

## Overview

This checklist is based on [clean-code-javascript](https://github.com/ryanmcdermott/clean-code-javascript) principles adapted for ES6+ TypeScript.

## Scoring System

Each category is scored out of 10 points. The weighted average determines the final score.

## 1. Variables (15% weight)

**Score:** ___ / 10

### Criteria

- [ ] **Meaningful and pronounceable names**
  - Variable names should reveal intent
  - Avoid abbreviations unless universally understood
  - Use full words instead of single letters

  ```typescript
  // ❌ Bad
  const d = new Date();
  const yyyymmdstr = formatDate(d);

  // ✅ Good
  const currentDate = new Date();
  const formattedDate = formatDate(currentDate);
  ```

- [ ] **Consistent vocabulary**
  - Use the same term for the same concept
  - Don't mix `get`, `fetch`, `retrieve` for the same operation

  ```typescript
  // ❌ Bad
  getUserInfo();
  getClientData();
  getCustomerRecord();

  // ✅ Good
  getUser();
  getClient();
  getCustomer();
  ```

- [ ] **Searchable names (no magic numbers)**
  - Extract constants for any non-obvious value
  - Name constants to explain their purpose

  ```typescript
  // ❌ Bad
  setTimeout(blastOff, 86400000);

  // ✅ Good
  const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
  setTimeout(blastOff, MILLISECONDS_PER_DAY);
  ```

- [ ] **Explanatory variables**
  - Break complex expressions into named variables
  - Make intermediate steps explicit

  ```typescript
  // ❌ Bad
  const address = 'One Infinite Loop, Cupertino 95014';
  const cityZipCodeRegex = /^[^,\\]+[,\\\s]+(.+?)\s*(\d{5})?$/;
  saveCityZipCode(
    address.match(cityZipCodeRegex)?.[1],
    address.match(cityZipCodeRegex)?.[2]
  );

  // ✅ Good
  const address = 'One Infinite Loop, Cupertino 95014';
  const cityZipCodeRegex = /^[^,\\]+[,\\\s]+(.+?)\s*(\d{5})?$/;
  const match = address.match(cityZipCodeRegex);
  const city = match?.[1];
  const zipCode = match?.[2];
  saveCityZipCode(city, zipCode);
  ```

- [ ] **No single-letter variables** (except loop indices)
  - Use descriptive names even for short-lived variables
  - Exception: `i`, `j`, `k` for simple loops

- [ ] **No redundant context**
  - Don't repeat class/object name in property names

  ```typescript
  // ❌ Bad
  const car = {
    carMake: 'Honda',
    carModel: 'Accord',
    carColor: 'Blue'
  };

  // ✅ Good
  const car = {
    make: 'Honda',
    model: 'Accord',
    color: 'Blue'
  };
  ```

- [ ] **Default parameters used**
  - Use default parameters instead of conditionals

  ```typescript
  // ❌ Bad
  function createMicrobrewery(name?: string) {
    const breweryName = name || 'Hipster Brew Co.';
    // ...
  }

  // ✅ Good
  function createMicrobrewery(name: string = 'Hipster Brew Co.') {
    // ...
  }
  ```

**Deductions:**
- -1 point for each non-descriptive variable name
- -2 points for each magic number
- -1 point for each unnecessary abbreviation

---

## 2. Functions (25% weight)

**Score:** ___ / 10

### Criteria

- [ ] **2 or fewer arguments** (or use object destructuring)
  - Functions should have minimal parameters
  - Use object destructuring for > 2 parameters

  ```typescript
  // ❌ Bad
  function createMenu(title: string, body: string, buttonText: string, cancellable: boolean) {
    // ...
  }

  // ✅ Good
  interface CreateMenuOptions {
    title: string;
    body: string;
    buttonText: string;
    cancellable: boolean;
  }

  function createMenu(options: CreateMenuOptions) {
    // ...
  }
  ```

- [ ] **Single responsibility**
  - Each function should do ONE thing well
  - Extract multiple responsibilities into separate functions

  ```typescript
  // ❌ Bad
  function emailClients(clients: Client[]) {
    clients.forEach(client => {
      const clientRecord = database.lookup(client);
      if (clientRecord.isActive()) {
        email(client);
      }
    });
  }

  // ✅ Good
  function emailActiveClients(clients: Client[]) {
    clients.filter(isActiveClient).forEach(email);
  }

  function isActiveClient(client: Client): boolean {
    const clientRecord = database.lookup(client);
    return clientRecord.isActive();
  }
  ```

- [ ] **Descriptive names**
  - Function names should be verbs or verb phrases
  - Names should describe what the function does

  ```typescript
  // ❌ Bad
  function addToDate(date: Date, month: number): Date {
    // ...
  }

  // ✅ Good
  function addMonthToDate(date: Date, month: number): Date {
    // ...
  }
  ```

- [ ] **Single abstraction level**
  - All statements in a function should be at the same level of abstraction
  - High-level operations don't mix with low-level details

- [ ] **No duplicate code (DRY)**
  - Extract common patterns into reusable functions
  - Use utility functions for repeated logic

- [ ] **No flag parameters**
  - Boolean flags indicate function does more than one thing
  - Split into separate functions

  ```typescript
  // ❌ Bad
  function createFile(name: string, temp: boolean) {
    if (temp) {
      fs.create(`./temp/${name}`);
    } else {
      fs.create(name);
    }
  }

  // ✅ Good
  function createFile(name: string) {
    fs.create(name);
  }

  function createTempFile(name: string) {
    createFile(`./temp/${name}`);
  }
  ```

- [ ] **No side effects**
  - Functions should not modify global state
  - Pure functions return new values instead of modifying inputs

- [ ] **Encapsulated conditionals**
  - Extract complex conditionals into named functions

  ```typescript
  // ❌ Bad
  if (fsm.state === 'fetching' && isEmpty(listNode)) {
    // ...
  }

  // ✅ Good
  function shouldShowSpinner(fsm: FSM, listNode: Node): boolean {
    return fsm.state === 'fetching' && isEmpty(listNode);
  }

  if (shouldShowSpinner(fsmInstance, listNodeInstance)) {
    // ...
  }
  ```

**Deductions:**
- -2 points for each function with > 3 parameters (not using object)
- -2 points for each function doing multiple things
- -1 point for each non-descriptive function name
- -1 point for each flag parameter

---

## 3. Classes (20% weight)

**Score:** ___ / 10

### Criteria

- [ ] **ES6 class syntax**
  - Use modern class syntax instead of constructor functions

  ```typescript
  // ❌ Bad
  function Animal(age: number) {
    this.age = age;
  }
  Animal.prototype.move = function() {};

  // ✅ Good
  class Animal {
    constructor(private age: number) {}
    move() {}
  }
  ```

- [ ] **Private members for internals**
  - Use `private` for internal state and methods
  - Only expose public API

  ```typescript
  // ❌ Bad
  class Employee {
    name: string;
    email: string;

    constructor(name: string, email: string) {
      this.name = name;
      this.email = email;
    }
  }

  // ✅ Good
  class Employee {
    constructor(
      private name: string,
      private email: string
    ) {}

    getName(): string {
      return this.name;
    }
  }
  ```

- [ ] **Method chaining where appropriate**
  - Return `this` from methods to allow chaining
  - Improves readability for builder patterns

  ```typescript
  // ✅ Good
  class Car {
    private make: string = '';
    private model: string = '';

    setMake(make: string): this {
      this.make = make;
      return this;
    }

    setModel(model: string): this {
      this.model = model;
      return this;
    }

    save(): void {
      console.log(this.make, this.model);
    }
  }

  const car = new Car()
    .setMake('Ford')
    .setModel('F-150')
    .save();
  ```

- [ ] **Small, focused classes**
  - Classes should have a single responsibility
  - Keep classes under 200-300 lines

**Deductions:**
- -2 points for using old-style constructor functions
- -1 point for each exposed internal member
- -2 points for large classes (> 300 lines)

---

## 4. SOLID Principles (20% weight)

**Score:** ___ / 10

### Criteria

- [ ] **Single Responsibility Principle (SRP)**
  - Each class/module should have one reason to change
  - One class = one responsibility

  ```typescript
  // ❌ Bad
  class UserSettings {
    constructor(private user: User) {}

    changeSettings(settings: Settings) {
      if (this.verifyCredentials()) {
        // ...
      }
    }

    verifyCredentials() {
      // ...
    }
  }

  // ✅ Good
  class UserAuth {
    constructor(private user: User) {}
    verifyCredentials() {
      // ...
    }
  }

  class UserSettings {
    constructor(
      private user: User,
      private auth: UserAuth
    ) {}

    changeSettings(settings: Settings) {
      if (this.auth.verifyCredentials()) {
        // ...
      }
    }
  }
  ```

- [ ] **Open/Closed Principle (OCP)**
  - Open for extension, closed for modification
  - Use inheritance, composition, or strategy pattern

- [ ] **Liskov Substitution Principle (LSP)**
  - Subtypes must be substitutable for their base types
  - Child classes should not break parent class contracts

- [ ] **Interface Segregation Principle (ISP)**
  - Clients shouldn't depend on interfaces they don't use
  - Prefer multiple small interfaces over one large interface

- [ ] **Dependency Inversion Principle (DIP)**
  - Depend on abstractions, not concretions
  - Use dependency injection

  ```typescript
  // ❌ Bad
  class InventoryRequester {
    constructor() {
      this.REQ_METHODS = ['HTTP'];
    }

    requestItem(item: string) {
      // ...
    }
  }

  class InventoryTracker {
    private items: string[];
    private requester: InventoryRequester;

    constructor(items: string[]) {
      this.items = items;
      this.requester = new InventoryRequester(); // ❌ Direct instantiation
    }

    requestItems() {
      this.items.forEach(item => {
        this.requester.requestItem(item);
      });
    }
  }

  // ✅ Good
  interface InventoryRequester {
    requestItem(item: string): void;
  }

  class InventoryTracker {
    constructor(
      private items: string[],
      private requester: InventoryRequester // ✅ Dependency injection
    ) {}

    requestItems() {
      this.items.forEach(item => {
        this.requester.requestItem(item);
      });
    }
  }
  ```

**Deductions:**
- -2 points for each SRP violation
- -2 points for lack of dependency injection
- -1 point for each tight coupling

---

## 5. Error Handling (10% weight)

**Score:** ___ / 10

### Criteria

- [ ] **No silent failures**
  - Don't catch errors and do nothing
  - Log or re-throw errors

  ```typescript
  // ❌ Bad
  try {
    functionThatMightThrow();
  } catch (error) {
    // Silent failure
  }

  // ✅ Good
  try {
    functionThatMightThrow();
  } catch (error) {
    console.error(error);
    // or
    notifyUserOfError(error);
    // or
    reportErrorToService(error);
  }
  ```

- [ ] **Specific error messages**
  - Provide context about what went wrong
  - Include relevant data in error messages

- [ ] **Custom error types**
  - Create domain-specific error classes
  - Makes error handling more precise

  ```typescript
  // ✅ Good
  class DirectoryNotFoundError extends Error {
    constructor(public readonly path: string) {
      super(`Directory not found: ${path}`);
      this.name = 'DirectoryNotFoundError';
    }
  }

  throw new DirectoryNotFoundError('/path/to/dir');
  ```

- [ ] **Promise rejections handled**
  - Always use `.catch()` or `try/catch` with async/await

**Deductions:**
- -3 points for silent error catching
- -2 points for generic error messages
- -1 point for missing custom error classes

---

## 6. Async/Await (5% weight)

**Score:** ___ / 10

### Criteria

- [ ] **Async/await over callbacks**
  - Modern async syntax is more readable
  - Avoid callback hell

  ```typescript
  // ❌ Bad
  import fs from 'fs';

  fs.readFile('file.txt', (err, data) => {
    if (err) {
      console.error(err);
    } else {
      console.log(data);
    }
  });

  // ✅ Good
  import fs from 'fs/promises';

  async function readFile() {
    try {
      const data = await fs.readFile('file.txt', 'utf-8');
      console.log(data);
    } catch (error) {
      console.error(error);
    }
  }
  ```

- [ ] **Promise.all for parallel ops**
  - Use `Promise.all()` for independent async operations
  - Improves performance

  ```typescript
  // ❌ Bad (sequential)
  async function getFullPost() {
    const post = await getPost();
    const comments = await getComments(post.id);
    const author = await getAuthor(post.authorId);
    return { post, comments, author };
  }

  // ✅ Good (parallel)
  async function getFullPost() {
    const post = await getPost();
    const [comments, author] = await Promise.all([
      getComments(post.id),
      getAuthor(post.authorId)
    ]);
    return { post, comments, author };
  }
  ```

- [ ] **Proper error handling**
  - Use try/catch with async/await
  - Handle promise rejections

**Deductions:**
- -3 points for callback-based code (where async/await is better)
- -2 points for sequential async calls that could be parallel

---

## 7. Comments (5% weight)

**Score:** ___ / 10

### Criteria

- [ ] **Self-documenting code**
  - Code should explain itself through good naming
  - Only comment the "why", not the "what"

  ```typescript
  // ❌ Bad
  // Check if user is active
  if (user.status === 'active') {
    // ...
  }

  // ✅ Good
  if (user.isActive()) {
    // ...
  }
  ```

- [ ] **No commented-out code**
  - Delete dead code instead of commenting it out
  - Use version control (git) for history

- [ ] **JSDoc for public APIs**
  - Document public functions/methods with JSDoc
  - Include param types, return types, and examples

  ```typescript
  /**
   * Scans a directory for R-related files.
   *
   * @param options - Scan configuration options
   * @returns Structured scan result with categorized files
   * @throws {DirectoryNotFoundError} If target directory doesn't exist
   *
   * @example
   * ```typescript
   * const result = await scan({ targetDir: '.', recursive: true });
   * console.log(result.files.rScripts);
   * ```
   */
  export async function scan(options: ScanOptions): Promise<ScanResult> {
    // ...
  }
  ```

**Deductions:**
- -2 points for commented-out code
- -1 point for obvious comments
- -1 point for missing JSDoc on public APIs

---

## Final Score Calculation

```
Final Score = (Variables × 0.15) + (Functions × 0.25) + (Classes × 0.20) +
              (SOLID × 0.20) + (Errors × 0.10) + (Async × 0.05) + (Comments × 0.05)
```

### Score Interpretation

| Score | Rating | Action |
|-------|--------|--------|
| 9-10 | Excellent | Minor tweaks only |
| 7-8.9 | Good | Some improvements needed |
| 5-6.9 | Fair | Significant refactoring recommended |
| < 5 | Poor | Major refactoring required |

## Summary Checklist

Quick reference for evaluation:

- [ ] Variables: Meaningful names, no magic numbers
- [ ] Functions: ≤2 params, single responsibility
- [ ] Classes: ES6 syntax, private members
- [ ] SOLID: SRP, DIP (dependency injection)
- [ ] Errors: Custom errors, no silent failures
- [ ] Async: async/await, Promise.all
- [ ] Comments: Self-documenting code, JSDoc for APIs
