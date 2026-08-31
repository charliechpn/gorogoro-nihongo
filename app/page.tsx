import { defaultLocale, homeCopy } from './content';

const content = homeCopy[defaultLocale];

const modeCards = [
  {
    id: 'kanji-cards',
    image: '/home-assets/mode-kanji.png',
    title: 'Cards de kanji',
    description: 'Treine significado, leituras e memória.',
    light: false,
    href: '/treino/kanji',
    wide: false,
  },
  {
    id: 'vocabulary',
    image: '/home-assets/mode-vocabulary.png',
    title: 'Vocabulário',
    description: 'Palavras comuns ligadas a cada kanji.',
    light: true,
    href: null,
    wide: false,
  },
  {
    id: 'word-game',
    image: '/home-assets/mode-word-game.png',
    title: 'Cite uma palavra',
    description: 'Puxe da memória palavras com o kanji.',
    light: false,
    href: '/treino/palavras',
    wide: false,
  },
  {
    id: 'verb-pairs',
    image: '/home-assets/mode-verbs.png',
    title: 'Verbos em pares',
    description: 'Transitivo × intransitivo, sem emboscada.',
    light: true,
    href: '/treino/verbos',
    wide: false,
  },
  {
    id: 'onomatopoeia',
    image: '/mode-onomatopoeia-wide-v2.png',
    title: 'Onomatopeias',
    description: 'Som, sensação e contexto em dois níveis de dificuldade.',
    light: true,
    href: '/treino/onomatopeias',
    wide: true,
  },
] as const;

const featuredKanji = [
  { character: '学', reading: 'まな・ぶ' },
  { character: '永', reading: 'なが・い' },
  { character: '光', reading: 'ひかり' },
  { character: '心', reading: 'こころ' },
  { character: '道', reading: 'みち' },
] as const;

const dailyActions = [
  { icon: '語', label: 'Vocabulário', sublabel: '今日の単語' },
  { icon: '聴', label: 'Escuta', sublabel: 'リスニング' },
  { icon: '話', label: 'Fala', sublabel: '話す練習' },
  { icon: '復', label: 'Revisão', sublabel: '復習する' },
] as const;

export default function Home() {
  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="topbar-side topbar-left">
          <button className="menu-button" type="button" aria-label="Abrir menu">
            <span /><span />
          </button>
          <a className="cat-mark" href="#inicio" aria-label="Página inicial">
            <img src="/home-assets/cat-mark.png" alt="" />
          </a>
        </div>

        <nav className="main-nav" aria-label="Navegação principal">
          <a href="#modos">{content.navigation.trainings}</a>
          <button type="button">{content.navigation.kanjiDatabase}</button>
          <button type="button">{content.navigation.progress}</button>
          <button type="button">{content.navigation.community}<i aria-hidden="true" /></button>
        </nav>

        <div className="topbar-side topbar-right">
          <button className="search-button" type="button" aria-label="Pesquisar" />
          <button className="profile-mark" type="button" aria-label="Perfil">
            <img src="/home-assets/cat-profile.png" alt="" />
          </button>
        </div>
      </header>

      <section className="hero" id="inicio">
        <img
          className="hero-art"
          src="/home-assets/hero-garden.png"
          alt="Jardim japonês em aquarela com bambu, lago e um gato"
        />

        <div className="hero-copy">
          <p className="eyebrow">ESTUDE JAPONÊS. USE O QUE APRENDE.</p>
          <h1>
            <span>Aprenda</span>
            <span>japonês</span>
            <span className="headline-accent">de verdade.</span>
          </h1>
          <p className="hero-description">
            Kanji e vocabulário em treinos diretos, claros e feitos para caber no seu ritmo.
          </p>
          <a className="primary-action" href="#modos">
            Começar a praticar
            <span aria-hidden="true">🐾</span>
          </a>
        </div>
      </section>

      <section className="modes" id="modos" aria-label="Modos de estudo">
        <div className="mode-grid">
          {modeCards.map((mode) => {
            const cardContent = (
              <>
              <img src={mode.image} alt="" aria-hidden="true" />
              <span className="mode-copy">
                <strong>{mode.title}</strong>
                <span>{mode.description}</span>
              </span>
              </>
            );

            return mode.href ? (
              <a className={`mode-card${mode.light ? ' is-light' : ''}${mode.wide ? ' is-wide' : ''}`} href={mode.href} key={mode.id}>
                {cardContent}
              </a>
            ) : (
              <button
                className={`mode-card${mode.light ? ' is-light' : ''}${mode.wide ? ' is-wide' : ''}`}
                type="button"
                key={mode.id}
              >
                {cardContent}
              </button>
            );
          })}
        </div>
      </section>

      <section className="practice-row" aria-label="Práticas em destaque">
        <section className="daily-panel" aria-labelledby="daily-title">
          <img
            className="daily-art"
            src="/home-assets/daily-practice.png"
            alt="Gato estudando japonês em uma mesa baixa"
          />
          <div className="daily-heading">
            <h2 id="daily-title">Prática diária</h2>
            <p>Pequenos passos, progresso real.</p>
          </div>
          <div className="daily-actions">
            {dailyActions.map((action) => (
              <button type="button" key={action.label}>
                <i aria-hidden="true">{action.icon}</i>
                <strong>{action.label}</strong>
                <span>{action.sublabel}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="kanji-panel" aria-labelledby="featured-kanji-title">
          <div className="panel-heading">
            <div>
              <h2 id="featured-kanji-title">Prática de kanji</h2>
              <p>Veja. Lembre. Use.</p>
            </div>
            <button type="button">Ver todos os kanjis</button>
          </div>

          <div className="kanji-list">
            {featuredKanji.map((item) => (
              <button type="button" className="kanji-tile" key={item.character}>
                <strong>{item.character}</strong>
                <span>{item.reading}</span>
              </button>
            ))}
          </div>
          <span className="brush" aria-hidden="true" />
        </section>
      </section>

      <section className="closing-banner" aria-label="Mensagem final">
        <img src="/home-assets/footer-banner-trimmed.png" alt="Paisagem japonesa em aquarela" />
        <div className="closing-copy">
          <strong>言葉は橋、心は旅。</strong>
          <span>A língua é uma ponte; o coração, uma viagem.</span>
        </div>
      </section>

      <footer className="site-footer">
        <span>© 2026 Nihongo</span>
      </footer>
    </main>
  );
}
