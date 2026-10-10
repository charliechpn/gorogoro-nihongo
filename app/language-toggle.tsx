'use client';

import { setLanguage, useLanguage } from './language';

export default function LanguageToggle() {
  const language = useLanguage();
  return (
    <div className="language-toggle" role="group" aria-label={language === 'pt' ? 'Idioma da interface' : 'Interface language'}>
      <button type="button" lang="pt-BR" aria-pressed={language === 'pt'} onClick={() => setLanguage('pt')}>PT</button>
      <button type="button" lang="en" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
    </div>
  );
}
