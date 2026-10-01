import { derived, writable } from 'svelte/store';
import en from './en.json';
import fr from './fr.json';

const dictionaries: Record<string, Record<string, string>> = { fr, en };

export const LOCALES = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'English' }
] as const;

export type Locale = (typeof LOCALES)[number]['id'];

const STORAGE_KEY = 'maw:locale';

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'fr';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in dictionaries) return saved as Locale;
  } catch {
    /* storage unavailable */
  }
  const nav = navigator.language.slice(0, 2);
  return (nav in dictionaries ? nav : 'en') as Locale;
}

export const locale = writable<Locale>(detectLocale());

locale.subscribe((l) => {
  if (typeof window === 'undefined') return;
  document.documentElement.lang = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* storage unavailable */
  }
});

export type Translate = (key: string, params?: Record<string, string | number>) => string;

export const t = derived(locale, (l): Translate => (key, params) => {
  const raw = dictionaries[l]?.[key] ?? dictionaries.en?.[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
});
