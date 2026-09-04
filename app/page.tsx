import { defaultLocale, homeCopy } from './content';

const content = homeCopy[defaultLocale];

const modeCards = [
  {
    id: 'vocabulary',
    image: '/home-assets/mode-vocabulary.png',
    title: 'Vocabulário',
    description: 'Palavras comuns ligadas a cada kanji.',
    light: true,
    href: '/treino/vocabulario',
  },
  {
    id: 'word-game',
    image: '/home-assets/mode-word-game.png',
    title: 'Cite uma palavra',
    description: 'Puxe da memória palavras com o kanji.',
    light: false,
    href: '/treino/palavras',
  },
  {
    id: 'verb-pairs',
    image: '/home-assets/mode-verbs.png',
    title: 'Verbos em pares',
    description: 'Transitivo × intransitivo, sem emboscada.',
    light: true,
    href: '/treino/verbos',
  },
  {
    id: 'onomatopoeia',
    image: '/home-assets/mode-kanji.png',
    title: 'Onomatopeias',
    description: 'Som, sensação e contexto em dois níveis de dificuldade.',
    light: false,
    href: '/treino/onomatopeias',
  },
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

      <section className="practice-row" aria-label="Práticas em destaque">
        <section className="profile-panel" aria-labelledby="profile-title">
          <img
            className="profile-art"
            src="/home-assets/daily-practice.png"
            alt="Gato estudando japonês em uma mesa baixa"
          />
          <div className="profile-heading">
            <h2 id="profile-title">Perfil</h2>
            <p>Seu progresso, suas metas e seu ritmo de estudo.</p>
          </div>
        </section>

        <a className="kanji-panel" href="/treino/kanji" aria-labelledby="kanji-training-title">
          <img
            className="kanji-panel-art"
            src="/home-assets/kanji-practice.png"
            alt="Cinco cartões bordados com kanjis"
          />
          <span className="kanji-panel-copy">
            <strong id="kanji-training-title">Treino de kanjis</strong>
            <span>Escolha por JLPT ou série escolar e pratique no seu ritmo.</span>
          </span>
        </a>
      </section>

      <section className="modes" id="modos" aria-label="Modos de estudo">
        <div className="mode-grid">
          {modeCards.map((mode) => (
            <a
              className={`mode-card${mode.light ? ' is-light' : ''}`}
              href={mode.href}
              key={mode.id}
            >
              <img src={mode.image} alt="" aria-hidden="true" />
              <span className="mode-copy">
                <strong>{mode.title}</strong>
                <span>{mode.description}</span>
              </span>
            </a>
          ))}
        </div>
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
