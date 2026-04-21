import { SupportedLanguage } from '../types/prompt-context';
import { LocaleData } from './types';

import enLocale from './locales/en.json';
import zhTWLocale from './locales/zh-TW.json';

const LOCALES: Record<SupportedLanguage, LocaleData> = {
    'en': enLocale as LocaleData,
    'zh-TW': zhTWLocale as LocaleData,
};

export function loadLocale(language: SupportedLanguage): LocaleData {
    const locale = LOCALES[language];

    if (!locale) {
        console.warn(`Locale '${language}' not found, falling back to 'en'`);
        return LOCALES['en'];
    }

    return locale;
}

export function getAvailableLanguages(): SupportedLanguage[] {
    return Object.keys(LOCALES) as SupportedLanguage[];
}

export function isLanguageSupported(language: string): language is SupportedLanguage {
    return language in LOCALES;
}
