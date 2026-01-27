/**
 * Prompts Module
 *
 * Exports all prompt generation functionality.
 */

export {
    buildRoleSection,
    buildEnvironmentSection,
    buildCapabilitiesSection,
    buildFileContextSection,
    buildConstraintsSection,
    buildCustomSection,
    identifyKeyPackages,
    groupCapabilities,
    estimateTokens,
} from './section-builders';
