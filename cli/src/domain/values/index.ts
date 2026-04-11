/**
 * Domain value objects and entities
 *
 * Pure domain types with no infrastructure or application concerns.
 */

// Scan results and file metadata
export { FileInfo, createFileInfo } from './file-info';
export { ProjectInfo, createProjectInfo } from './project-info';
export { ScanResult, RFileCollection, ScanResultProps, createScanResult } from './scan-result';
export { LibraryInfo, LibraryScanResult, LibraryScanOptions, createLibraryInfo, createLibraryScanResult } from './library-info';
export { EnvironmentContext } from './environment-context';

// Token and cost accounting
export { CacheStatus } from './cache-status';
export { TokenBudget, type ContextHealth, type TokenUsageSnapshot } from './token-budget';

// LLM output
export { type LLMOutputType, type LLMOutputJSON } from './llm-output';
