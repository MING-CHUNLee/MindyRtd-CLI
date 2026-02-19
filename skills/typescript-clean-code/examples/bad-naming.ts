/**
 * Bad Naming Examples
 *
 * This file demonstrates common naming anti-patterns in TypeScript.
 * DO NOT use these patterns in production code.
 */

// ============================================================================
// VARIABLES - Non-Descriptive and Ambiguous
// ============================================================================

// ❌ Bad: Single-letter variables (not in loops)
const d = new Date();
const u = getUserData();
const f = formatDate(d);

// ❌ Bad: Abbreviations that aren't universally understood
const usrPrflDta = fetchUserProfile();
const cfg = loadConfig();
const tmp = calculateTemp();

// ❌ Bad: Magic numbers scattered throughout code
setTimeout(blastOff, 86400000); // What is 86400000?
if (fileSize > 5242880) { // What is 5242880?
  throw new Error('File too large');
}

// ❌ Bad: Non-searchable names
const x = 7;
const y = 42;
const z = x * y;

// ============================================================================
// INCONSISTENT VOCABULARY
// ============================================================================

// ❌ Bad: Different terms for same concept
function getUserInfo() { /* ... */ }
function fetchClientData() { /* ... */ }
function retrieveCustomerRecord() { /* ... */ }
function getAccountDetails() { /* ... */ }

// Is "get", "fetch", "retrieve" the same? Confusing!

// ============================================================================
// REDUNDANT CONTEXT
// ============================================================================

// ❌ Bad: Repeating class/object name in properties
interface Car {
  carMake: string;
  carModel: string;
  carColor: string;
  carYear: number;
}

const car: Car = {
  carMake: 'Honda',
  carModel: 'Accord',
  carColor: 'Blue',
  carYear: 2024,
};

// "car" is already in the context!

// ============================================================================
// UNCLEAR FUNCTION NAMES
// ============================================================================

// ❌ Bad: Vague action
function process(data: any) { /* ... */ }
function handle(input: any) { /* ... */ }
function do(thing: any) { /* ... */ }

// ❌ Bad: Not descriptive enough
function add(a: number, b: number) {
  // Wait, add to what? Database? Array? Just return sum?
  return a + b;
}

// ❌ Bad: Misleading name
function getData() {
  // Actually makes an API call, updates state, AND returns data
  updateUserState();
  logActivity();
  return fetch('/api/data');
}

// ============================================================================
// BOOLEAN NAMING ISSUES
// ============================================================================

// ❌ Bad: Not using is/has/can prefix
function valid(email: string): boolean { // Should be isValid
  return email.includes('@');
}

function permission(user: User): boolean { // Should be hasPermission
  return user.permissions.length > 0;
}

// ❌ Bad: Negative booleans (confusing)
function isNotValid(email: string): boolean {
  return !email.includes('@');
}

if (!isNotValid(email)) { // Double negative!
  // ...
}

// ============================================================================
// CLASS NAMING ISSUES
// ============================================================================

// ❌ Bad: Vague class names
class Manager { /* ... */ } // Manager of what?
class Handler { /* ... */ } // Handles what?
class Processor { /* ... */ } // Processes what?
class Helper { /* ... */ } // Helps with what?

// ❌ Bad: Class name doesn't match responsibility
class User {
  // Actually does authentication, email sending, logging, etc.
  authenticate() { /* ... */ }
  sendEmail() { /* ... */ }
  logActivity() { /* ... */ }
  calculateTax() { /* ... */ }
}

// ============================================================================
// INTERFACE NAMING ISSUES
// ============================================================================

// ❌ Bad: Generic, non-descriptive
interface Data {
  value: any;
  type: string;
}

interface Info {
  id: number;
  name: string;
}

// ❌ Bad: Hungarian notation (outdated)
interface IUserService { /* ... */ }
interface IAuthController { /* ... */ }

// Modern TypeScript doesn't need "I" prefix

// ============================================================================
// TYPE ALIAS ISSUES
// ============================================================================

// ❌ Bad: Too generic
type Thing = string | number;
type Stuff = any[];
type Whatever = { [key: string]: any };

// ============================================================================
// MIXED CONVENTIONS
// ============================================================================

// ❌ Bad: Inconsistent casing
const UserName = 'John'; // Should be userName
const user_email = 'john@example.com'; // Should be userEmail
const USERID = '123'; // Should be userId or USER_ID

function Get_User_Data() { /* ... */ } // Should be getUserData
class user_service { /* ... */ } // Should be UserService

// ============================================================================
// COMMENT-DEPENDENT NAMES
// ============================================================================

// ❌ Bad: Name requires comment to understand
const d = new Date(); // current date
const t = 86400000; // milliseconds per day
const e = 'user@example.com'; // user email

// Names should be self-documenting!

// ============================================================================
// SUMMARY OF ANTI-PATTERNS
// ============================================================================

/*
 * Anti-patterns to avoid:
 * 1. ❌ Single-letter variables (except loop indices)
 * 2. ❌ Unclear abbreviations
 * 3. ❌ Magic numbers without names
 * 4. ❌ Inconsistent vocabulary
 * 5. ❌ Redundant context in property names
 * 6. ❌ Vague function names (process, handle, do)
 * 7. ❌ Missing is/has/can for booleans
 * 8. ❌ Generic class names (Manager, Handler)
 * 9. ❌ Hungarian notation (IInterface)
 * 10. ❌ Inconsistent casing
 *
 * If your name needs a comment to explain it, choose a better name!
 */
