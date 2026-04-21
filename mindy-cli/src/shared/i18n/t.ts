import { LocaleData } from './types';

/**
 * Get a specific translation key with optional interpolation
 *
 * @example
 * t(locale, 'environment.userPackages.title', { count: 10 })
 * // Returns: "User-Installed Packages (first 10)"
 */
export function t(locale: LocaleData, key: string, params?: Record<string, string | number>): string {
    const keys = key.split('.');
    let value: unknown = locale;

    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = (value as Record<string, unknown>)[k];
        } else {
            return key;
        }
    }

    if (typeof value !== 'string') {
        return key;
    }

    if (params) {
        return value.replace(/\{(\w+)\}/g, (_, paramKey) =>
            String(params[paramKey] ?? `{${paramKey}}`)
        );
    }

    return value;
}
