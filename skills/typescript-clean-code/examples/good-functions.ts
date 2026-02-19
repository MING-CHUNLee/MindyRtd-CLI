/**
 * Good Functions Examples
 *
 * This file demonstrates best practices for writing clean functions
 * in TypeScript following Clean Code principles.
 */

// ============================================================================
// SINGLE RESPONSIBILITY PRINCIPLE
// ============================================================================

// ✅ Good: Each function does ONE thing well
async function emailActiveClients(clients: Client[]): Promise<void> {
  const activeClients = clients.filter(isActiveClient);
  await Promise.all(activeClients.map(sendEmail));
}

function isActiveClient(client: Client): boolean {
  const clientRecord = database.lookup(client);
  return clientRecord.isActive();
}

async function sendEmail(client: Client): Promise<void> {
  await emailService.send({
    to: client.email,
    subject: 'Newsletter',
    body: getNewsletterContent(),
  });
}

// ============================================================================
// SMALL PARAMETER LISTS (≤2 parameters or use objects)
// ============================================================================

// ✅ Good: Using object destructuring for multiple parameters
interface CreateUserOptions {
  name: string;
  email: string;
  age: number;
  isAdmin: boolean;
  department?: string;
}

function createUser(options: CreateUserOptions): User {
  const { name, email, age, isAdmin, department = 'General' } = options;

  return {
    id: generateId(),
    name,
    email,
    age,
    isAdmin,
    department,
    createdAt: new Date(),
  };
}

// Usage - self-documenting
createUser({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  isAdmin: false,
});

// ============================================================================
// DESCRIPTIVE NAMES
// ============================================================================

// ✅ Good: Function names clearly describe what they do
function calculateMonthlyPayment(principal: number, interestRate: number, months: number): number {
  const monthlyRate = interestRate / 12;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
}

function filterUsersByActivationStatus(users: User[], isActive: boolean): User[] {
  return users.filter(user => user.isActive === isActive);
}

async function fetchUserProfileWithPosts(userId: string): Promise<UserProfileWithPosts> {
  const user = await getUser(userId);
  const posts = await getPosts(userId);
  return { user, posts };
}

// ============================================================================
// NO FLAG PARAMETERS
// ============================================================================

// ✅ Good: Split into separate functions instead of using flags
function createFile(name: string): void {
  fs.writeFileSync(name, '');
}

function createTempFile(name: string): void {
  createFile(path.join('./temp', name));
}

function createConfigFile(name: string, config: Config): void {
  fs.writeFileSync(name, JSON.stringify(config, null, 2));
}

// Usage
createFile('data.json');
createTempFile('cache.json');
createConfigFile('settings.json', appConfig);

// ============================================================================
// ENCAPSULATED CONDITIONALS
// ============================================================================

// ✅ Good: Extract complex conditionals into named functions
function shouldShowSpinner(fsm: FSM, listNode: Node): boolean {
  return fsm.state === 'fetching' && isEmpty(listNode);
}

function canUserEditPost(user: User, post: Post): boolean {
  return user.id === post.authorId || user.role === 'admin';
}

function isEligibleForDiscount(customer: Customer): boolean {
  return customer.totalPurchases > 1000 || customer.isPremiumMember;
}

// Usage
if (shouldShowSpinner(fsmInstance, listNodeInstance)) {
  showSpinner();
}

if (canUserEditPost(currentUser, selectedPost)) {
  enableEditButton();
}

// ============================================================================
// PURE FUNCTIONS (No side effects)
// ============================================================================

// ✅ Good: Pure function - same input = same output, no side effects
function addMonthsToDate(date: Date, months: number): Date {
  const newDate = new Date(date); // Create new instance
  newDate.setMonth(newDate.getMonth() + months);
  return newDate; // Return new date, don't modify original
}

function calculateTotalPrice(items: Item[], taxRate: number): number {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  return subtotal * (1 + taxRate);
}

function formatUserName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

// ============================================================================
// ASYNC/AWAIT PATTERNS
// ============================================================================

// ✅ Good: Use async/await for clarity
async function getUserData(userId: string): Promise<UserData> {
  try {
    const user = await fetchUser(userId);
    const posts = await fetchPosts(userId);
    const comments = await fetchComments(userId);

    return { user, posts, comments };
  } catch (error) {
    console.error(`Failed to fetch user data: ${error.message}`);
    throw new UserDataFetchError(userId, error);
  }
}

// ✅ Good: Use Promise.all for parallel operations
async function getFullUserProfile(userId: string): Promise<FullProfile> {
  const user = await getUser(userId);

  // Fetch posts and comments in parallel (they don't depend on each other)
  const [posts, comments] = await Promise.all([
    getPosts(user.id),
    getComments(user.id),
  ]);

  return { user, posts, comments };
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

// ✅ Good: Specific error handling with custom error classes
class UserNotFoundError extends Error {
  constructor(public readonly userId: string) {
    super(`User not found: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

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

async function getValidatedUser(userId: string): Promise<User> {
  if (!userId) {
    throw new ValidationError('userId', userId, 'User ID is required');
  }

  try {
    const user = await database.findUser(userId);

    if (!user) {
      throw new UserNotFoundError(userId);
    }

    return user;
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      throw error; // Re-throw domain errors
    }

    // Log unexpected errors and throw generic error
    console.error('Unexpected error fetching user:', error);
    throw new Error(`Failed to fetch user: ${userId}`);
  }
}

// ============================================================================
// SINGLE ABSTRACTION LEVEL
// ============================================================================

// ✅ Good: All statements at same abstraction level
async function processOrder(orderId: string): Promise<ProcessedOrder> {
  const order = await fetchOrder(orderId);
  const validatedOrder = validateOrder(order);
  const processedOrder = applyDiscounts(validatedOrder);
  const finalOrder = calculateTotals(processedOrder);

  await saveOrder(finalOrder);

  return finalOrder;
}

// Each helper function is at a similar abstraction level
async function fetchOrder(orderId: string): Promise<Order> {
  return database.getOrder(orderId);
}

function validateOrder(order: Order): Order {
  if (!order.items.length) {
    throw new ValidationError('items', order.items, 'Order must have at least one item');
  }
  return order;
}

function applyDiscounts(order: Order): Order {
  return {
    ...order,
    items: order.items.map(applyItemDiscount),
  };
}

function calculateTotals(order: Order): ProcessedOrder {
  const subtotal = order.items.reduce((sum, item) => sum + item.price, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  return { ...order, subtotal, tax, total };
}

// ============================================================================
// DRY (Don't Repeat Yourself)
// ============================================================================

// ✅ Good: Extract common patterns
function createResourceUrl(resourceType: string, resourceId: string): string {
  const baseUrl = config.apiBaseUrl;
  return `${baseUrl}/${resourceType}/${resourceId}`;
}

async function getUser(userId: string): Promise<User> {
  const url = createResourceUrl('users', userId);
  return fetchResource<User>(url);
}

async function getPost(postId: string): Promise<Post> {
  const url = createResourceUrl('posts', postId);
  return fetchResource<Post>(url);
}

async function getComment(commentId: string): Promise<Comment> {
  const url = createResourceUrl('comments', commentId);
  return fetchResource<Comment>(url);
}

async function fetchResource<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch resource: ${url}`);
  }

  return response.json();
}

// ============================================================================
// COMMAND-QUERY SEPARATION
// ============================================================================

// ✅ Good: Commands (modify state) and Queries (return data) are separate

// Query - returns data, no side effects
function getUserCount(): number {
  return userCache.size;
}

// Command - modifies state, returns void
function addUser(user: User): void {
  userCache.set(user.id, user);
  notifyUserAdded(user);
}

// ✅ Good: Clear naming shows intent
async function fetchAndCacheUser(userId: string): Promise<User> {
  const user = await fetchUser(userId);
  userCache.set(userId, user); // Side effect is clear from name
  return user;
}

// ============================================================================
// DEPENDENCY INJECTION
// ============================================================================

// ✅ Good: Dependencies injected, easy to test
interface IEmailService {
  send(email: Email): Promise<void>;
}

interface IUserRepository {
  find(userId: string): Promise<User>;
  save(user: User): Promise<void>;
}

class UserService {
  constructor(
    private emailService: IEmailService,
    private userRepository: IUserRepository
  ) {}

  async notifyUser(userId: string, message: string): Promise<void> {
    const user = await this.userRepository.find(userId);

    await this.emailService.send({
      to: user.email,
      subject: 'Notification',
      body: message,
    });
  }
}

// Usage
const emailService = new SendGridEmailService();
const userRepository = new DatabaseUserRepository();
const userService = new UserService(emailService, userRepository);

// Testing
const mockEmailService = { send: vi.fn() };
const mockUserRepository = { find: vi.fn(), save: vi.fn() };
const testUserService = new UserService(mockEmailService, mockUserRepository);

// ============================================================================
// SUMMARY
// ============================================================================

/*
 * Clean Function Principles:
 * 1. ✅ Single Responsibility - one function, one job
 * 2. ✅ Small parameter lists - ≤2 params or use object
 * 3. ✅ Descriptive names - function name explains what it does
 * 4. ✅ No flag parameters - split into separate functions
 * 5. ✅ Encapsulated conditionals - extract to named functions
 * 6. ✅ Pure functions - no side effects when possible
 * 7. ✅ Async/await - modern async patterns
 * 8. ✅ Specific errors - custom error classes
 * 9. ✅ Single abstraction level - consistent detail level
 * 10. ✅ DRY - extract common patterns
 * 11. ✅ Command-Query Separation - clear intent
 * 12. ✅ Dependency Injection - testable, flexible
 */
