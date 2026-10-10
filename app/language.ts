'use client';

import { useSyncExternalStore } from 'react';

export type Language = 'en' | 'pt';

const STORAGE_KEY = 'gorogoro-language';
const CHANGE_EVENT = 'gorogoro-language-change';

function getLanguage(): Language {
  return document.documentElement.dataset.language === 'pt' ? 'pt' : 'en';
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    applyLanguage(event.newValue === 'pt' ? 'pt' : 'en');
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

function applyLanguage(language: Language) {
  document.documentElement.dataset.language = language;
  document.documentElement.lang = language === 'pt' ? 'pt-BR' : 'en';
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function setLanguage(language: Language) {
  applyLanguage(language);
  try { window.localStorage.setItem(STORAGE_KEY, language); } catch { /* Keep the choice for this visit. */ }
}

export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getLanguage, () => 'en');
}

export function useText() {
  const language = useLanguage();
  return (portuguese: string, english: string) => language === 'pt' ? portuguese : english;
}
