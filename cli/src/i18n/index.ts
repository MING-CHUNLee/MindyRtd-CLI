/**
 * i18n Module
 *
 * Internationalization support for the CLI.
 * Handles locale loading and translation.
 */

import { SupportedLanguage } from '../types/prompt-context';

// Import locale JSON files directly (TypeScript handles bundling)
import enLocale from './locales/en.json';
import zhTWLocale from './locales/zh-TW.json';

// ============================================
// Types
// ============================================

export interface LocaleData {
    role: {
        title: string;
        description: string;
        tasks: { title: string; items: string[] };
        language: { title: string; description: string; options: string[]; note: string };
    };
    environment: {
        title: string;
        basicInfo: {
            title: string;
            rVersion: string;
            rHome: string;
            libraryPaths: string;
            totalPackages: string;
            base: string;
            user: string;
        };
        keyPackages: { title: string; installed: string };
        userPackages: { title: string; more: string };
    };
    capabilities: {
        title: string;
        intro: string;
        analysis: { title: string; available: string; notAvailable: string };
        specific: { title: string };
        warning: string;
        categories: Record<string, string>;
    };
    files: {
        title: string;
        project: {
            title: string;
            name: string;
            type: string;
            workingDir: string;
            noProject: string;
            na: string;
        };
        stats: {
            title: string;
            rScripts: string;
            rMarkdown: string;
            rData: string;
            total: string;
            files: string;
        };
        available: { title: string };
    };
    constraints: {
        title: string;
        safety: {
            title: string;
            never: string;
            askFirst: string;
            showDiff: string;
            items: {
                noDelete: string;
                noSystem: string;
                confirmInstall: string;
                confirmModify: string;
            };
        };
        error: { title: string; items: string[] };
        style: { title: string; items: string[] };
        output: { title: string; codeFormat: string; explanation: string };
    };
    custom: { title: string };
    minimal: { note: string };
}

// ============================================
// Locales Registry
// ============================================

const LOCALES: Record<SupportedLanguage, LocaleData> = {
    'en': enLocale as LocaleData,
    'zh-TW': zhTWLocale as LocaleData,
};

// ============================================
// Public API
// ============================================

/**
 * Load locale data for a specific language
 */
export function loadLocale(language: SupportedLanguage): LocaleData {
    const locale = LOCALES[language];

    if (!locale) {
        console.warn(`Locale '${language}' not found, falling back to 'en'`);
        return LOCALES['en'];
    }

    return locale;
}

/**
 * Get a specific translation key with optional interpolation
 *
 * @example
 * t(locale, 'environment.userPackages.title', { count: 10 })
 * // Returns: "User-Installed Packages (first 10)"
 */
export function t(locale: LocaleData, key: string, params?: Record<string, string | number>): string {
    // Navigate to the key using dot notation
    const keys = key.split('.');
    let value: unknown = locale;

    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = (value as Record<string, unknown>)[k];
        } else {
            return key; // Return key if not found
        }
    }

    if (typeof value !== 'string') {
        return key;
    }

    // Interpolate params
    if (params) {
        return value.replace(/\{(\w+)\}/g, (_, paramKey) =>
            String(params[paramKey] ?? `{${paramKey}}`)
        );
    }

    return value;
}

/**
 * Get all available languages
 */
export function getAvailableLanguages(): SupportedLanguage[] {
    return Object.keys(LOCALES) as SupportedLanguage[];
}

/**
 * Check if a language is supported
 */
export function isLanguageSupported(language: string): language is SupportedLanguage {
    return language in LOCALES;
}
