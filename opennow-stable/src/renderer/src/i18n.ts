import { useMemo, useSyncExternalStore } from "react";

import fallbackTranslations from "../../../../locales/vi.json";

type TranslationValue = string | number | boolean | null | undefined;
type TranslationValues = Record<string, TranslationValue>;
type TranslationLeaf = string;
type TranslationTree = { [key: string]: TranslationLeaf | TranslationTree };

const FIXED_LOCALE = "vi";
const LOCALE_STORAGE_KEY = "opennow.locale";
const fallbackTree = fallbackTranslations as TranslationTree;
const listeners = new Set<() => void>();

let activeLocale = FIXED_LOCALE;
let activeTranslations = fallbackTree;
let snapshotVersion = 0;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): number {
  return snapshotVersion;
}

function emitChange(): void {
  snapshotVersion += 1;
  for (const listener of listeners) {
    listener();
  }
}

function persistFixedLocale(): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, FIXED_LOCALE);
  } catch {
    // Ignore storage failures; Vietnamese remains active for this runtime.
  }
}

function setFixedTranslations(): void {
  activeLocale = FIXED_LOCALE;
  activeTranslations = fallbackTree;
  document.documentElement.lang = FIXED_LOCALE;
  emitChange();
}

function readNestedValue(tree: TranslationTree, key: string): string | null {
  let current: TranslationLeaf | TranslationTree | undefined = tree;
  for (const segment of key.split(".")) {
    if (!current || typeof current !== "object") return null;
    current = current[segment];
  }
  return typeof current === "string" ? current : null;
}

function interpolate(template: string, values: TranslationValues): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, token: string) => {
    const value = values[token];
    return value === undefined || value === null ? match : String(value);
  });
}

function resolvePluralKey(key: string, values: TranslationValues): string {
  return typeof values.count === "number" && values.count !== 1 ? `${key}_plural` : key;
}

export function t(key: string, values: TranslationValues = {}): string {
  const resolvedKey = resolvePluralKey(key, values);
  const translation =
    readNestedValue(activeTranslations, resolvedKey) ??
    readNestedValue(activeTranslations, key);

  if (!translation) {
    if (import.meta.env.DEV) {
      console.warn(`[i18n] Missing Vietnamese translation key "${key}".`);
    }
    return key;
  }

  return interpolate(translation, values);
}

export function getLocale(): string {
  return FIXED_LOCALE;
}

export function getAvailableLocales(): string[] {
  return [FIXED_LOCALE];
}

export async function setLocale(_locale: string): Promise<void> {
  persistFixedLocale();
  setFixedTranslations();
}

export async function initializeLocale(): Promise<void> {
  persistFixedLocale();
  setFixedTranslations();
}

export function useTranslation(): {
  locale: string;
  availableLocales: string[];
  setLocale: (locale: string) => Promise<void>;
  t: typeof t;
} {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => ({
    locale: FIXED_LOCALE,
    availableLocales: [FIXED_LOCALE],
    setLocale,
    t,
  }), [snapshot]);
}
