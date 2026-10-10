'use client';

import SiteHeader from '@/app/site-header';
import HomeTooltip from './home-tooltip';
import ThemeArt from './theme-art';
import { useText } from './language';
import styles from './home-cards.module.css';




const modeCards = [
  {
    id: 'vocabulary',
    image: '/home-assets/mode-vocabulary.png',
    darkImage: '/home-assets/mode-vocabulary-dark.webp',
    title: 'Vocabulário',
    titleEn: 'Vocabulary',
    description: 'Palavras comuns ligadas a cada kanji.',
    descriptionEn: 'Common words connected to each kanji.',
    light: true,
    href: '/treino/vocabulario',
  },
  {
    id: 'word-game',
    image: '/home-assets/icon-cat-3.png',
    darkImage: null,
    title: 'Cite uma palavra',
    titleEn: 'Name a word',
    description: 'Puxe da memória palavras com o kanji.',
    descriptionEn: 'Recall words that use the given kanji.',
    light: false,
    href: '/treino/palavras',
  },
  {
    id: 'verb-pairs',
    image: '/home-assets/icon-book-2.png',
    darkImage: '/home-assets/icon-book-2-dark.webp',
    title: 'Verbos em pares',
    titleEn: 'Verb pairs',
    description: 'Identifique verbos transitivos, intransitivos e os que dependem do uso.',
    descriptionEn: 'Identify transitive and intransitive verbs, and verbs whose use depends on context.',
    light: true,
    href: '/treino/verbos',
  },
  {
    id: 'onomatopoeia',
    image: '/home-assets/mode-kanji.png',
    darkImage: null,
    title: 'Onomatopeias',
    titleEn: 'Onomatopoeia',
    description: 'Som, sensação e contexto em dois níveis de dificuldade.',
    descriptionEn: 'Sound, sensation, and context at two difficulty levels.',
    light: false,
    href: '/treino/onomatopeias',
  },
] as const;

export default function Home() {
  const t = useText();
  return (
    <main className={`page-shell ${styles.home}`}>
      <SiteHeader />

      <section className="hero" id="inicio">
        <ThemeArt
          className="hero-art"
          src="/home-assets/hero-garden.png"
          darkSrc="/home-assets/hero-garden-dark-cutout.webp"
          alt={t('Jardim japonês em aquarela com bambu, lago e um gato', 'Watercolor Japanese garden with bamboo, a pond, and a cat')}
        />

        <div className="hero-copy">
          <p className="eyebrow">{t('ESTUDE JAPONÊS. USE O QUE APRENDE.', 'STUDY JAPANESE. PUT IT TO USE.')}</p>
          <h1>
            <span>{t('Aprenda', 'Learn')}</span>
            <span>{t('japonês', 'Japanese')}</span>
            <span className="headline-accent">{t('de verdade.', 'for real.')}</span>
          </h1>
          <p className="hero-description">
            {t('Kanji e vocabulário em treinos diretos, claros e feitos para caber no seu ritmo.', 'Straightforward kanji and vocabulary practice that fits your pace.')}
          </p>
        </div>
      </section>

      <section className="practice-row" aria-label={t('Práticas em destaque', 'Featured practice')}>
        <div className={styles.feature}>
          <div className="profile-panel">
            <ThemeArt className="profile-art" src="/home-assets/daily-practice.png" darkSrc="/home-assets/daily-practice-dark.webp" alt={t('Gato estudando japonês em uma mesa baixa', 'Cat studying Japanese at a low table')} />
          </div>
        </div>
        <HomeTooltip id="kanji-description" text={t('Escolha por JLPT ou série escolar e pratique no seu ritmo.', 'Choose a JLPT level or school grade and practice at your own pace.')} className={styles.feature}>
        <a aria-describedby="kanji-description" className="kanji-panel" href="/treino/kanji" aria-labelledby="kanji-training-title">
          <ThemeArt
            className="kanji-panel-art"
            src="/home-assets/kanji-practice.png"
            darkSrc="/home-assets/kanji-practice-dark.webp"
            alt={t('Cinco cartões bordados com kanjis', 'Five embroidered kanji cards')}
          />
          <span className="kanji-panel-copy">
            <strong id="kanji-training-title">{t('Kanjis', 'Kanji')}</strong>

          </span>
        </a>
        </HomeTooltip>
      </section>

      <section className="modes" id="modos" aria-label={t('Modos de estudo', 'Study modes')}>
        <div className="mode-grid">
          {modeCards.map((mode) => (
            <HomeTooltip key={mode.id} id={mode.id + '-description'} text={t(mode.description, mode.descriptionEn)} className={styles.modeHost}>
            <a
              className={`mode-card${mode.light ? ' is-light' : ''}`}
              href={mode.href}
              data-mode={mode.id}
              aria-describedby={mode.id + '-description'}
            >
              {mode.darkImage
                ? <ThemeArt src={mode.image} darkSrc={mode.darkImage} alt="" aria-hidden="true" />
                : <img src={mode.image} alt="" aria-hidden="true" />}
              <span className="mode-copy">
                <strong>{mode.id === 'word-game' ? <>{t('Cite uma', 'Name a')}<br />{t('palavra', 'word')}</> : mode.id === 'verb-pairs' ? <>{t('Verbos', 'Verb')}<br />{t('em pares', 'pairs')}</> : t(mode.title, mode.titleEn)}</strong>

              </span>
            </a>
            </HomeTooltip>
          ))}
        </div>
      </section>

      <section className="closing-banner" aria-label={t('Mensagem final', 'Closing message')}>
        <ThemeArt src="/home-assets/footer-banner-trimmed.png" darkSrc="/home-assets/footer-banner-trimmed-dark-cropped.webp" alt={t('Paisagem japonesa em aquarela', 'Watercolor Japanese landscape')} />
        <div className="closing-copy">
          <strong>言葉は橋、心は旅。</strong>
          <span>{t('A língua é uma ponte; o coração, uma viagem.', 'Language is a bridge; the heart, a journey.')}</span>
        </div>
      </section>

      <footer className="site-footer">
        <span>© 2026 GoroGoro Nihongo</span>
      </footer>
    </main>
  );
}
