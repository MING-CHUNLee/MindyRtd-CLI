/**
 * Application Constants
 *
 * Centralized constants for the CLI application.
 * Following 12-Factor App principle: configuration in one place.
 */

// ============================================
// Cache Configuration
// ============================================

export const CACHE = {
    /** Environment cache TTL (5 minutes) */
    ENVIRONMENT_TTL_MS: 5 * 60 * 1000,
    /** File scan cache TTL (30 seconds) */
    FILE_SCAN_TTL_MS: 30 * 1000,
} as const;

// ============================================
// Display Limits
// ============================================

export const DISPLAY = {
    /** Maximum files to show in scan result */
    MAX_FILES_DISPLAY: 10,
    /** Maximum packages to list in prompt */
    MAX_PACKAGES_TO_LIST: 50,
    /** Maximum files to list in prompt */
    MAX_FILES_TO_LIST: 20,
    /** Minimal mode package limit */
    MINIMAL_PACKAGES_LIMIT: 10,
    /** Minimal mode file limit */
    MINIMAL_FILES_LIMIT: 5,
} as const;

// ============================================
// LLM Configuration
// ============================================

export const LLM = {
    /** Default request timeout (30 seconds) */
    DEFAULT_TIMEOUT_MS: 30_000,
    /** Maximum timeout allowed (5 minutes) */
    MAX_TIMEOUT_MS: 5 * 60 * 1000,
    /** Default max tokens */
    DEFAULT_MAX_TOKENS: 4096,
    /** Maximum retry attempts */
    MAX_RETRIES: 3,
    /** Maximum backoff delay (10 seconds) */
    MAX_BACKOFF_MS: 10_000,
    /** System prompt max length */
    MAX_SYSTEM_PROMPT_LENGTH: 100_000,
    /** User message max length */
    MAX_USER_MESSAGE_LENGTH: 50_000,
} as const;

// ============================================
// File Scanning
// ============================================

export const FILE_SCAN = {
    /** Recursive glob pattern */
    RECURSIVE_PATTERN: '**/*',
    /** Top-level only pattern */
    TOP_LEVEL_PATTERN: '*',
    /** Hidden file patterns to ignore */
    HIDDEN_FILE_PATTERNS: ['**/.*', '**/.*/**'],
} as const;

// ============================================
// R Script Configuration
// ============================================

export const R_SCRIPT = {
    /** Temp script filename prefix */
    TEMP_SCRIPT_PREFIX: 'mindy_r_script_',
    /** Temp script file extension */
    TEMP_SCRIPT_EXTENSION: '.R',
} as const;

// ============================================
// Token Estimation
// ============================================

export const TOKEN_ESTIMATION = {
    /** Characters per token for English text */
    CHARS_PER_TOKEN_ENGLISH: 4,
    /** Characters per token for Chinese text */
    CHARS_PER_TOKEN_CHINESE: 2,
} as const;

// ============================================
// Supported Languages
// ============================================

export const SUPPORTED_LANGUAGES = ['en', 'zh-TW'] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number];
