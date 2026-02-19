/**
 * Good Naming Examples
 *
 * This file demonstrates best practices for variable, function, and class naming
 * in TypeScript following Clean Code principles.
 */

// ============================================================================
// VARIABLES - Meaningful and Pronounceable
// ============================================================================

// ✅ Good: Descriptive, pronounceable names
const currentDate = new Date();
const formattedDate = formatDate(currentDate);
const userProfileData = fetchUserProfile();

// ✅ Good: Constants with clear purpose
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_FILE_SIZE_MB = 5;
const DEFAULT_TIMEOUT_SECONDS = 30;

// ✅ Good: Searchable names (no magic numbers)
const RETRY_ATTEMPTS = 3;
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_NOT_FOUND = 404;

setTimeout(checkStatus, MILLISECONDS_PER_DAY);

// ============================================================================
// CONSISTENT VOCABULARY
// ============================================================================

// ✅ Good: Same concept = same term
function getUser(id: string): User { /* ... */ }
function getClient(id: string): Client { /* ... */ }
function getCustomer(id: string): Customer { /* ... */ }

// Each uses "get" consistently for retrieval

// ============================================================================
// EXPLANATORY VARIABLES
// ============================================================================

// ✅ Good: Break complex expressions into named variables
function parseAddress(address: string): AddressParts {
  const cityZipCodeRegex = /^[^,\\]+[,\\\s]+(.+?)\s*(\d{5})?$/;
  const match = address.match(cityZipCodeRegex);

  const street = match?.[0] || '';
  const city = match?.[1] || '';
  const zipCode = match?.[2] || '';

  return { street, city, zipCode };
}

// ============================================================================
// NO REDUNDANT CONTEXT
// ============================================================================

// ✅ Good: Don't repeat class/object name in properties
interface Car {
  make: string;      // Not: carMake
  model: string;     // Not: carModel
  color: string;     // Not: carColor
  year: number;      // Not: carYear
}

const honda: Car = {
  make: 'Honda',
  model: 'Accord',
  color: 'Blue',
  year: 2024,
};

// ============================================================================
// FUNCTIONS - Descriptive and Action-Oriented
// ============================================================================

// ✅ Good: Verb + noun pattern
function calculateTotalPrice(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

function validateUserEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

async function fetchUserProfile(userId: string): Promise<UserProfile> {
  const response = await fetch(`/api/users/${userId}`);
  return response.json();
}

// ✅ Good: Boolean functions use is/has/can prefix
function isValidEmail(email: string): boolean {
  return email.includes('@');
}

function hasPermission(user: User, action: string): boolean {
  return user.permissions.includes(action);
}

function canPerformAction(user: User, action: string): boolean {
  return user.isActive && hasPermission(user, action);
}

// ============================================================================
// CLASSES - Clear Responsibility
// ============================================================================

// ✅ Good: Class name describes responsibility
class UserAuthenticator {
  constructor(private authService: AuthService) {}

  async authenticate(credentials: Credentials): Promise<User> {
    const isValid = await this.authService.validate(credentials);
    if (!isValid) {
      throw new AuthenticationError('Invalid credentials');
    }
    return this.authService.getUser(credentials.username);
  }
}

class EmailValidator {
  private emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  validate(email: string): boolean {
    return this.emailRegex.test(email);
  }

  getErrorMessage(email: string): string | null {
    if (!this.validate(email)) {
      return `Invalid email format: ${email}`;
    }
    return null;
  }
}

// ============================================================================
// INTERFACES - Clear Data Shapes
// ============================================================================

// ✅ Good: Interface describes data structure clearly
interface UserProfile {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ScanOptions {
  targetDir: string;
  recursive: boolean;
  includeHidden: boolean;
  maxDepth: number;
}

interface ScanResult {
  files: {
    rScripts: string[];
    rMarkdown: string[];
    dataFiles: string[];
  };
  totalFiles: number;
  scannedAt: Date;
}

// ============================================================================
// ENUMS - Clear States
// ============================================================================

// ✅ Good: Enum represents states clearly
enum UserRole {
  Admin = 'admin',
  Moderator = 'moderator',
  User = 'user',
  Guest = 'guest',
}

enum FileType {
  RScript = 'r-script',
  RMarkdown = 'r-markdown',
  RData = 'r-data',
  CSV = 'csv',
  Unknown = 'unknown',
}

// ============================================================================
// TYPE ALIASES - Semantic Meaning
// ============================================================================

// ✅ Good: Type alias adds semantic meaning
type UserId = string;
type Email = string;
type Timestamp = number;
type FilePath = string;

function createUser(id: UserId, email: Email): User {
  return {
    id,
    email,
    createdAt: Date.now() as Timestamp,
  };
}

// ============================================================================
// SUMMARY
// ============================================================================

/*
 * Key Principles:
 * 1. Variables: Descriptive, pronounceable, searchable
 * 2. Functions: Verb-based, describe actions
 * 3. Classes: Noun-based, describe responsibilities
 * 4. Booleans: is/has/can prefix
 * 5. Constants: UPPER_SNAKE_CASE
 * 6. No magic numbers: Extract named constants
 * 7. No redundant context: Don't repeat object/class names
 * 8. Consistent vocabulary: Same concept = same term
 */
