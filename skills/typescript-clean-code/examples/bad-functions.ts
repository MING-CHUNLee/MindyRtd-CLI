/**
 * Bad Functions Examples
 *
 * This file demonstrates common function anti-patterns in TypeScript.
 * DO NOT use these patterns in production code.
 */

// ============================================================================
// VIOLATES SINGLE RESPONSIBILITY
// ============================================================================

// ❌ Bad: Function does too many things
function emailClients(clients: Client[]) {
  clients.forEach(client => {
    // 1. Database lookup
    const clientRecord = database.lookup(client);

    // 2. Business logic
    if (clientRecord.isActive()) {
      // 3. Email sending
      const template = loadEmailTemplate();
      const body = template.render({ client });

      // 4. Logging
      console.log(`Sending email to ${client.email}`);

      // 5. Error handling
      try {
        email(client, body);
      } catch (error) {
        // 6. Error logging
        console.error(`Failed to email ${client.email}`);
      }

      // 7. Analytics
      analytics.track('email_sent', { clientId: client.id });
    }
  });
}

// This function should be split into smaller functions!

// ============================================================================
// TOO MANY PARAMETERS
// ============================================================================

// ❌ Bad: More than 2 parameters without object destructuring
function createMenu(
  title: string,
  body: string,
  buttonText: string,
  cancellable: boolean,
  theme: string,
  position: string,
  width: number,
  height: number
) {
  // Hard to call, easy to mix up parameter order
}

createMenu(
  'Save Changes',
  'Are you sure?',
  'OK',
  true,
  'dark',
  'center',
  400,
  200
); // What is what?

// ❌ Bad: Function signature keeps growing
function processUser(
  name: string,
  email: string,
  age: number,
  address: string,
  phone: string,
  isActive: boolean,
  role: string
) {
  // ...
}

// ============================================================================
// UNCLEAR NAMES
// ============================================================================

// ❌ Bad: Vague, non-descriptive names
function process(data: any) {
  // Process what? How?
  return data.map(x => x * 2);
}

function handle(input: any) {
  // Handle what? How?
  return input.trim();
}

function do(thing: any) {
  // Do what?
  console.log(thing);
}

// ❌ Bad: Name doesn't match behavior
function getData(userId: string) {
  // Actually modifies database and logs
  database.update(userId, { lastAccess: new Date() }); // Side effect!
  logger.log(`User ${userId} accessed`); // Side effect!
  return database.get(userId);
}

// ============================================================================
// FLAG PARAMETERS
// ============================================================================

// ❌ Bad: Boolean flag indicates multiple responsibilities
function createFile(name: string, temp: boolean) {
  if (temp) {
    fs.create(`./temp/${name}`);
  } else {
    fs.create(name);
  }
}

// ❌ Bad: Multiple flags make it worse
function saveData(data: any, compress: boolean, encrypt: boolean, validate: boolean) {
  if (validate) {
    validateData(data);
  }

  if (compress) {
    data = compressData(data);
  }

  if (encrypt) {
    data = encryptData(data);
  }

  fs.writeFileSync('data.json', data);
}

// How many combinations? 2^3 = 8 different code paths!

// ============================================================================
// COMPLEX CONDITIONALS NOT ENCAPSULATED
// ============================================================================

// ❌ Bad: Inline complex conditionals
function renderButton(user: User, post: Post) {
  if (user.id === post.authorId || user.role === 'admin' || (user.isModerator && user.verified)) {
    return '<button>Edit</button>';
  }
}

// ❌ Bad: Nested conditionals without extraction
function calculateDiscount(customer: Customer, order: Order) {
  if (customer.isPremium) {
    if (customer.loyaltyPoints > 1000) {
      if (order.total > 100) {
        return order.total * 0.2;
      } else {
        return order.total * 0.1;
      }
    } else {
      if (order.total > 50) {
        return order.total * 0.05;
      }
    }
  } else {
    if (order.total > 200) {
      return order.total * 0.05;
    }
  }
  return 0;
}

// ============================================================================
// SIDE EFFECTS WITHOUT CLARITY
// ============================================================================

// ❌ Bad: Hidden side effects
function checkPassword(name: string, password: string): boolean {
  if (database.isValidPassword(name, password)) {
    // Hidden side effect: initializes session!
    session.initialize();
    return true;
  }
  return false;
}

// ❌ Bad: Function modifies global state unexpectedly
const globalConfig: any = {};

function setUserPreference(key: string, value: any) {
  // Modifies global state without clear indication
  globalConfig[key] = value;
  return value;
}

// ============================================================================
// CALLBACK HELL
// ============================================================================

// ❌ Bad: Nested callbacks (pyramid of doom)
function getFullUserData(userId: string, callback: Function) {
  getUser(userId, (err1, user) => {
    if (err1) return callback(err1);

    getPosts(user.id, (err2, posts) => {
      if (err2) return callback(err2);

      getComments(user.id, (err3, comments) => {
        if (err3) return callback(err3);

        getFollowers(user.id, (err4, followers) => {
          if (err4) return callback(err4);

          callback(null, { user, posts, comments, followers });
        });
      });
    });
  });
}

// ============================================================================
// MIXED ABSTRACTION LEVELS
// ============================================================================

// ❌ Bad: Mixing high-level and low-level operations
function processOrder(orderId: string) {
  // High-level
  const order = getOrder(orderId);

  // Low-level details
  const items = [];
  for (let i = 0; i < order.items.length; i++) {
    const item = order.items[i];
    if (item.quantity > 0 && item.price > 0) {
      items.push({
        id: item.id,
        qty: item.quantity,
        price: item.price * 0.9, // Hardcoded discount
      });
    }
  }

  // High-level again
  saveOrder(order);

  // Low-level logging
  console.log('[' + new Date().toISOString() + '] Order processed: ' + orderId);
}

// ============================================================================
// NOT DRY (WET: Write Everything Twice)
// ============================================================================

// ❌ Bad: Duplicated code
function getUser(userId: string): Promise<User> {
  const url = `${config.apiBaseUrl}/users/${userId}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch user: ${userId}`);
  }
  return response.json();
}

function getPost(postId: string): Promise<Post> {
  const url = `${config.apiBaseUrl}/posts/${postId}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch post: ${postId}`);
  }
  return response.json();
}

function getComment(commentId: string): Promise<Comment> {
  const url = `${config.apiBaseUrl}/comments/${commentId}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch comment: ${commentId}`);
  }
  return response.json();
}

// Same pattern repeated 3 times!

// ============================================================================
// POOR ERROR HANDLING
// ============================================================================

// ❌ Bad: Silent failures
function processData(data: any) {
  try {
    return transform(data);
  } catch (error) {
    // Silent failure - swallows error
  }
}

// ❌ Bad: Generic error messages
function fetchUser(userId: string) {
  if (!userId) {
    throw new Error('Error'); // Not helpful!
  }

  try {
    return database.getUser(userId);
  } catch (error) {
    throw new Error('Something went wrong'); // Still not helpful!
  }
}

// ❌ Bad: Catching everything
async function saveUser(user: User) {
  try {
    await database.save(user);
  } catch (error) {
    // Catches ALL errors, even programming errors
    console.log('Failed to save');
  }
}

// ============================================================================
// TIGHT COUPLING
// ============================================================================

// ❌ Bad: Direct instantiation (hard to test)
class UserService {
  private database = new Database(); // ❌ Tight coupling
  private emailService = new EmailService(); // ❌ Tight coupling

  async createUser(userData: UserData) {
    const user = await this.database.save(userData);
    await this.emailService.sendWelcomeEmail(user.email);
    return user;
  }
}

// Can't test without real database and email service!

// ============================================================================
// COMMAND-QUERY CONFUSION
// ============================================================================

// ❌ Bad: Function both modifies state AND returns data
function updateAndGetUser(userId: string, updates: any): User {
  // Command (modifies)
  database.update(userId, updates);
  logger.log(`Updated user ${userId}`);

  // Query (returns data)
  return database.get(userId);
}

// Is this a getter or a setter? Confusing!

// ============================================================================
// LARGE FUNCTIONS
// ============================================================================

// ❌ Bad: Function is too long (100+ lines)
function processUserRegistration(userData: any) {
  // Validation (20 lines)
  if (!userData.email) throw new Error('Email required');
  if (!userData.email.includes('@')) throw new Error('Invalid email');
  if (!userData.password) throw new Error('Password required');
  if (userData.password.length < 8) throw new Error('Password too short');
  // ... 15 more validations

  // Password hashing (10 lines)
  const salt = generateSalt();
  const hashedPassword = hash(userData.password, salt);
  // ... more crypto stuff

  // Database operations (15 lines)
  const existingUser = database.findByEmail(userData.email);
  if (existingUser) throw new Error('User exists');
  const user = database.create({ ...userData, password: hashedPassword });
  // ... more database stuff

  // Email sending (20 lines)
  const emailTemplate = loadTemplate('welcome');
  const emailBody = emailTemplate.render({ user });
  emailService.send(user.email, emailBody);
  // ... more email stuff

  // Logging (10 lines)
  logger.info(`User registered: ${user.id}`);
  // ... more logging

  // Analytics (10 lines)
  analytics.track('user_registered', { userId: user.id });
  // ... more analytics

  return user;
}

// This should be 6-7 separate functions!

// ============================================================================
// SUMMARY OF ANTI-PATTERNS
// ============================================================================

/*
 * Function anti-patterns to avoid:
 * 1. ❌ Multiple responsibilities in one function
 * 2. ❌ Too many parameters (> 2 without object)
 * 3. ❌ Vague, unclear names
 * 4. ❌ Flag parameters (booleans controlling behavior)
 * 5. ❌ Complex conditionals not extracted
 * 6. ❌ Hidden side effects
 * 7. ❌ Callback hell (use async/await)
 * 8. ❌ Mixed abstraction levels
 * 9. ❌ Code duplication (not DRY)
 * 10. ❌ Poor error handling (silent failures, generic messages)
 * 11. ❌ Tight coupling (direct instantiation)
 * 12. ❌ Command-Query confusion
 * 13. ❌ Large functions (> 20-30 lines)
 *
 * If your function does more than one thing, split it up!
 * If your function is hard to name, it probably does too much!
 */
