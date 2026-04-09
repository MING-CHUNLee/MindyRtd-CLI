/**
 * Views barrel export
 *
 * All view functions follow the Presentation Layer contract:
 *   - format*() → pure formatters, return string | string[]
 *   - display*() → thin I/O wrappers, call console.log on formatters
 */

export { getBanner, displayBanner } from './banner';

export {
    formatScanResult,
    formatProjectInfo,
    formatScanSummary,
    formatScanFileList,
    formatScanNextSteps,
    displayScanResult,
} from './scan-result';

export {
    formatEnvironmentSummary,
    formatRHealthCheck,
    formatCapabilities,
    formatCompactSummary,
} from './environment-result';

export {
    formatContextAsText,
    formatContextAsJson,
    formatContextHeader,
    formatContextEnvironmentSummary,
    formatContextPromptStatistics,
    formatContextFullPrompt,
    formatContextTips,
    highlightPrompt,
    outputAsJson,
    outputAsText,
    displayContextHeader,
    displayContextEnvironmentSummary,
    displayContextPromptStatistics,
    displayContextFullPrompt,
    displayContextTips,
} from './context-result';

export {
    formatStatusBar,
    formatHealthWarning,
    displayStatusBar,
} from './context-status-bar';

export {
    formatLibraryResult,
    formatLibrarySummary,
    formatLibraryList,
    formatCompactLibraryList,
    displayLibraryResult,
    displayCompactLibraryList,
} from './library-result';
