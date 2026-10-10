'use client';

import { useEffect, useState } from 'react';
import { useText } from './language';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'nihongo-theme';

export default function ThemeToggle() {
  const t = useText();
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const syncTheme = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      document.documentElement.dataset.theme = event.newValue === 'dark' ? 'dark' : 'light';
      syncTheme();
    };
    syncTheme();
    window.addEventListener('storage', syncStorage);
    return () => window.removeEventListener('storage', syncStorage);
  }, []);

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Private mode still allows this visit's choice. */ }
    setTheme(next);
  }

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? t('Ativar modo claro', 'Switch to light mode') : t('Ativar modo escuro', 'Switch to dark mode')}
      aria-pressed={theme === 'dark'}
      title={theme === 'dark' ? t('Ativar modo claro', 'Switch to light mode') : t('Ativar modo escuro', 'Switch to dark mode')}
    >
      <span className="theme-toggle-icon" aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
      <span className="theme-toggle-label">{theme === 'dark' ? t('Claro', 'Light') : t('Escuro', 'Dark')}</span>
    </button>
  );
}
