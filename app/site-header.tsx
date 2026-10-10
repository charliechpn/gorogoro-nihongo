'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import ThemeToggle from './theme-toggle';
import LanguageToggle from './language-toggle';
import { useLanguage, useText } from './language';

type Props = { homeLink?: boolean; onChangeSet?: () => void; changeSetLabel?: string; changeSetDisabled?: boolean };
export default function SiteHeader({ homeLink = false, onChangeSet, changeSetLabel, changeSetDisabled = false }: Props) {
  const language = useLanguage();
  const t = useText();
  useEffect(() => {
    document.title = language === 'pt' ? 'GoroGoro Nihongo | Treinos de japonês' : 'GoroGoro Nihongo | Japanese practice';
    document.querySelector('meta[name="description"]')?.setAttribute('content', language === 'pt'
      ? 'Pratique kanji e vocabulário em modos de estudo independentes.'
      : 'Practice kanji and vocabulary at your own pace.');
  }, [language]);
  return <header className={`topbar minimal-topbar${onChangeSet ? ' has-change-set' : ''}`}>
    <div className="header-home">
      <span className="cat-mark" aria-hidden="true"><img src="/home-assets/cat-mark.png" alt="" /></span>
      {homeLink && <Link className="training-home-link" href="/">{t('Início', 'Home')}</Link>}
    </div>
    <div className="header-context">
      {onChangeSet && <button className="training-change-set" type="button" onClick={onChangeSet} disabled={changeSetDisabled}>← {changeSetLabel ?? t('Trocar conjunto', 'Change set')}</button>}
    </div>
    <div className="header-actions">
      <LanguageToggle />
      <ThemeToggle />
      <span className="profile-mark" aria-hidden="true"><img src="/home-assets/cat-profile.png" alt="" /></span>
    </div>
  </header>;
}
