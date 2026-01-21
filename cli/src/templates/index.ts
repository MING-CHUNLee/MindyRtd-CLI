/**
 * Templates Module
 * 
 * Exports all template-related functionality including:
 * - Locale loading and translation
 * - Prompt section builders
 */

export { loadLocale, t, getAvailableLanguages, type LocaleData } from './locale-loader';
export * from './prompts';
