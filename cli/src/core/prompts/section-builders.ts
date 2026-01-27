/**
 * Section Builders for Prompt Generation
 *
 * Pure functions that build each section of the system prompt.
 * Each function takes data and locale, returns formatted string.
 *
 * Design Pattern:
 * - Angular Schematics (templates separate from logic)
 * - Yeoman Generators (template-based generation)
 */

import { LibraryScanResult, LibraryInfo } from '../../shared/types/library-info';
import { ScanResult } from '../../shared/types/scan-result';
import { CapabilityGroup } from '../../shared/types/prompt-context';
import { LocaleData, t } from '../../presentation/i18n';
import {
    PACKAGE_CAPABILITIES,
    KEY_PACKAGE_GROUPS,
    TIDYVERSE_CORE,
    IMPORTANT_PACKAGES
} from '../../shared/data/package-capabilities';
import { formatFileSize } from '../../shared/utils/format';
import { TOKEN_ESTIMATION } from '../../infrastructure/config/constants';

// ============================================
// Section Builder Functions
// ============================================

/**
 * Build the role definition section
 */
export function buildRoleSection(locale: LocaleData): string {
    const { role } = locale;

    return `# ${role.title}

${role.description}

# ${role.tasks.title}
${role.tasks.items.map(item => `- ${item}`).join('\n')}

# ${role.language.title}
- ${role.language.description}
    ${role.language.options.map(opt => `- ${opt}`).join('\n    ')}
- ${role.language.note}`;
}

/**
 * Build the environment information section
 */
export function buildEnvironmentSection(
    rEnvironment: LibraryScanResult,
    locale: LocaleData,
    options: { includePackageDetails: boolean; maxPackagesToList: number }
): string {
    const { environment } = locale;
    const packages = rEnvironment.libraries;

    // Categorize packages
    const basePackages = packages.filter(p => p.isBase);
    const userPackages = packages.filter(p => !p.isBase);

    // Find key packages
    const keyPackages = identifyKeyPackages(packages);

    let section = `# ${environment.title}

## ${environment.basicInfo.title}
- **${environment.basicInfo.rVersion}**: ${rEnvironment.rVersion}
- **${environment.basicInfo.rHome}**: ${rEnvironment.rHome}
- **${environment.basicInfo.libraryPaths}**: ${rEnvironment.libraryPaths.join(', ')}
- **${environment.basicInfo.totalPackages}**: ${packages.length} (${environment.basicInfo.base}: ${basePackages.length}, ${environment.basicInfo.user}: ${userPackages.length})

## ${environment.keyPackages.title}
${keyPackages.map(p => `- **${p}**: ${environment.keyPackages.installed}`).join('\n')}`;

    if (options.includePackageDetails && userPackages.length > 0) {
        const packagesToShow = userPackages.slice(0, options.maxPackagesToList);
        section += `\n\n## ${t(locale, 'environment.userPackages.title', { count: packagesToShow.length })}
${packagesToShow.map(p => `- ${p.name} (v${p.version})`).join('\n')}`;

        if (userPackages.length > options.maxPackagesToList) {
            section += `\n- ${t(locale, 'environment.userPackages.more', { count: userPackages.length - options.maxPackagesToList })}`;
        }
    }

    return section;
}

/**
 * Build the capabilities section
 */
export function buildCapabilitiesSection(
    rEnvironment: LibraryScanResult,
    locale: LocaleData
): string {
    const { capabilities } = locale;
    const packages = rEnvironment.libraries;
    const packageNames = new Set(packages.map(p => p.name));

    const uniqueCapabilities: string[] = [];

    // Check each package for known capabilities
    for (const [pkgName, caps] of Object.entries(PACKAGE_CAPABILITIES)) {
        if (packageNames.has(pkgName)) {
            uniqueCapabilities.push(...caps);
        }
    }

    // Deduplicate
    const dedupedCapabilities = [...new Set(uniqueCapabilities)];

    // Group capabilities
    const groupedCaps = groupCapabilities(packageNames, capabilities.categories);

    return `# ${capabilities.title}

${capabilities.intro}

## ${capabilities.analysis.title}
${groupedCaps.map(g => `- **${g.category}**: ${g.available ? capabilities.analysis.available : capabilities.analysis.notAvailable}`).join('\n')}

## ${capabilities.specific.title}
${dedupedCapabilities.slice(0, 20).map(c => `- ${c}`).join('\n')}

${capabilities.warning}`;
}

/**
 * Build the file context section
 */
export function buildFileContextSection(
    fileResult: ScanResult,
    locale: LocaleData,
    options: { includeFilePreview: boolean; maxFilesToList: number }
): string {
    const { files } = locale;
    const { projectInfo, baseDirectory } = fileResult;

    const rScripts = fileResult.files.rScripts || [];
    const rMarkdown = fileResult.files.rMarkdown || [];
    const rData = fileResult.files.rData || [];

    let section = `# ${files.title}

## ${files.project.title}
- **${files.project.name}**: ${projectInfo?.name || files.project.noProject}
- **${files.project.type}**: ${projectInfo?.type || files.project.na}
- **${files.project.workingDir}**: ${baseDirectory}

## ${files.stats.title}
- **${files.stats.rScripts}**: ${rScripts.length}
- **${files.stats.rMarkdown}**: ${rMarkdown.length}
- **${files.stats.rData}**: ${rData.length}
- **${files.stats.total}**: ${fileResult.totalFiles} ${files.stats.files}`;

    if (options.includeFilePreview) {
        const allFiles = [...rScripts, ...rMarkdown].slice(0, options.maxFilesToList);
        if (allFiles.length > 0) {
            section += `\n\n## ${files.available.title}
${allFiles.map(f => `- \`${f.name}\` (${formatFileSize(f.size)})`).join('\n')}`;
        }
    }

    return section;
}

/**
 * Build the constraints and guidelines section
 */
export function buildConstraintsSection(locale: LocaleData): string {
    const { constraints } = locale;

    return `# ${constraints.title}

## ${constraints.safety.title}
- **${constraints.safety.never}** ${constraints.safety.items.noDelete}
- **${constraints.safety.never}** ${constraints.safety.items.noSystem}
- **${constraints.safety.askFirst}** ${constraints.safety.items.confirmInstall}
- **${constraints.safety.showDiff}** ${constraints.safety.items.confirmModify}

## ${constraints.error.title}
${constraints.error.items.map(item => `- ${item}`).join('\n')}

## ${constraints.style.title}
${constraints.style.items.map(item => `- ${item}`).join('\n')}

## ${constraints.output.title}
${constraints.output.codeFormat}
\`\`\`r
# Your R code here
\`\`\`

${constraints.output.explanation}`;
}

/**
 * Build custom instructions section
 */
export function buildCustomSection(instructions: string, locale: LocaleData): string {
    return `# ${locale.custom.title}

${instructions}`;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Identify key/important packages from the installed list
 */
export function identifyKeyPackages(packages: LibraryInfo[]): string[] {
    const packageNames = new Set(packages.map(p => p.name));
    const keyPackages: string[] = [];

    // Check for tidyverse
    const hasTidyverse = TIDYVERSE_CORE.filter(p => packageNames.has(p));
    if (hasTidyverse.length >= 4) {
        keyPackages.push('tidyverse (core packages)');
    } else {
        keyPackages.push(...hasTidyverse);
    }

    // Check for other important packages
    for (const pkg of IMPORTANT_PACKAGES) {
        if (packageNames.has(pkg)) {
            keyPackages.push(pkg);
        }
    }

    return [...new Set(keyPackages)].slice(0, 10);
}

/**
 * Group capabilities by category
 */
export function groupCapabilities(
    packageNames: Set<string>,
    categoryNames: Record<string, string>
): CapabilityGroup[] {
    const results: CapabilityGroup[] = [];

    for (const [key, packages] of Object.entries(KEY_PACKAGE_GROUPS)) {
        const hasAny = packages.some(p => packageNames.has(p));
        results.push({
            category: categoryNames[key] || key,
            available: hasAny,
        });
    }

    return results;
}

/**
 * Estimate token count for a text
 */
export function estimateTokens(text: string): number {
    // Rough estimate based on character types
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;

    return Math.ceil(
        chineseChars / TOKEN_ESTIMATION.CHARS_PER_TOKEN_CHINESE +
        otherChars / TOKEN_ESTIMATION.CHARS_PER_TOKEN_ENGLISH
    );
}
