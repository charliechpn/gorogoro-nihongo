'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  closeVocabularySession,
  createVocabularySession,
  fetchVocabularyCatalog,
  resumeVocabularySession,
  submitVocabularyAnswer,
  type AnswerResult,
} from './api';
import type {
  VocabularyCatalogResponse,
  VocabularyDirection,
  VocabularySessionView,
} from './contracts';

const SESSION_KEY = 'nihongo-vocabulary-session-v2';
const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;

function directionLabel(direction: VocabularyDirection) {
  return direction === 'pt_to_jp' ? 'Português → japonês' : 'Japonês → português';
}

export default function VocabularyTrainerPage() {
  const [catalog, setCatalog] = useState<VocabularyCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [direction, setDirection] = useState<VocabularyDirection | null>(null);
  const [showFurigana, setShowFurigana] = useState(true);
  const [sessionFurigana, setSessionFurigana] = useState(true);
  const [session, setSession] = useState<VocabularySessionView | null>(null);
  const [resumableSession, setResumableSession] = useState<VocabularySessionView | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const payload = await fetchVocabularyCatalog();
        if (cancelled) return;
        setCatalog(payload);

        const savedSessionId = window.localStorage.getItem(SESSION_KEY);
        if (savedSessionId) {
          const resumed = await resumeVocabularySession(savedSessionId);
          if (cancelled) return;
          if (resumed) setResumableSession(resumed);
          else window.localStorage.removeItem(SESSION_KEY);
        }
      } catch {
        if (!cancelled) setLoadError('Não foi possível carregar o vocabulário.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void initialize();
    return () => { cancelled = true; };
  }, []);

  async function startTraining() {
    if (!selectedLevel || !direction || sessionBusy) return;

    setSessionBusy(true);
    try {
      const created = await createVocabularySession({
        level: selectedLevel,
        direction,
        showFurigana,
      });
      setSession(created);
      setSessionFurigana(created.showFurigana);
      setResumableSession(null);
      setRevealed(false);
      setSessionError('');
      window.localStorage.setItem(SESSION_KEY, created.sessionId);
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'Não foi possível iniciar o treino.');
    } finally {
      setSessionBusy(false);
    }
  }

  async function answer(result: AnswerResult) {
    if (!session || !revealed || sessionBusy) return;

    setSessionBusy(true);
    try {
      const updated = await submitVocabularyAnswer({
        sessionId: session.sessionId,
        turn: session.turn,
        vocabularyId: session.current.id,
        result,
      });
      setSession(updated);
      setRevealed(false);
      setSessionError('');
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'O baralho tropeçou na própria carta.');
    } finally {
      setSessionBusy(false);
    }
  }

  function continueSession() {
    if (!resumableSession) return;
    setSession(resumableSession);
    setSessionFurigana(resumableSession.showFurigana);
    setResumableSession(null);
    setRevealed(false);
    setSessionError('');
  }

  function leaveSession() {
    const sessionId = session?.sessionId;
    setSession(null);
    setResumableSession(null);
    setRevealed(false);
    setSessionError('');
    window.localStorage.removeItem(SESSION_KEY);
    if (sessionId) void closeVocabularySession(sessionId).catch(() => undefined);
  }

  if (session) {
    const { current, progress } = session;
    const isPortuguesePrompt = session.direction === 'pt_to_jp';
    const streakSymbol = progress.lastResult === 'correct' ? '✓' : progress.lastResult === 'wrong' ? '✗' : '—';
    const portugueseMeaning = current.meaningsPt.join(' · ');
    const primaryMeaning = current.promptPt ?? current.meaningsPt[0];

    return (
      <main className="trainer-page vocabulary-trainer-page">
        <header className="trainer-header vocabulary-trainer-header">
          <Link className="kanji-home-link" href="/" aria-label="Voltar para a página inicial">
            <img src="/home-assets/cat-mark.png" alt="" />
            <span>Início</span>
          </Link>
          <span className="kanji-trainer-brand">
            <small>言葉の庭</small>
            <strong>Treino de vocabulário</strong>
          </span>
          <button className="change-deck-button" type="button" onClick={leaveSession}>Trocar conjunto</button>
        </header>

        <section className="trainer-session vocabulary-session" aria-live="polite">
          <div className="kanji-session-heading vocabulary-session-heading">
            <p className="trainer-eyebrow">{directionLabel(session.direction).toUpperCase()}</p>
            <h1>{isPortuguesePrompt ? 'Puxe a palavra em japonês.' : 'Reconheça antes de revelar.'}</h1>
            <p>
              {isPortuguesePrompt
                ? 'Diga a palavra e a leitura em voz alta. Depois confira sem negociar com a própria memória.'
                : 'Lembre o significado em português antes de abrir a carta.'}
            </p>
          </div>

          <div className="kanji-session-layout vocabulary-session-layout">
            <button
              className={`study-card vocabulary-study-card${revealed ? ' is-revealed' : ''}`}
              type="button"
              onClick={() => setRevealed(true)}
              aria-label={revealed ? `Resposta de ${current.word}` : 'Mostrar resposta'}
            >
              <img className="study-card-art" src="/mode-vocabulary-card-v2.png" alt="" aria-hidden="true" />
              <span className="vocabulary-card-content">
                <span className="vocabulary-card-label">
                  {isPortuguesePrompt ? 'DIGA EM JAPONÊS' : 'DIGA EM PORTUGUÊS'}
                </span>

                {!revealed && isPortuguesePrompt && (
                  <strong className="vocabulary-portuguese-prompt">{primaryMeaning}</strong>
                )}

                {!revealed && !isPortuguesePrompt && (
                  <span className="vocabulary-japanese-prompt">
                    <ruby>
                      <strong>{current.word}</strong>
                      {sessionFurigana && <rt>{current.reading}</rt>}
                    </ruby>
                  </span>
                )}

                {revealed && (
                  <span className="vocabulary-revealed-answer">
                    <strong>{current.word}</strong>
                    <span>{current.reading}</span>
                    <i>{portugueseMeaning}</i>
                  </span>
                )}

                {!revealed && <small className="reveal-hint">Toque para revelar</small>}
              </span>
            </button>

            <aside className="session-console vocabulary-console">
              <div className="session-console-heading">
                <span>Carta atual</span>
                <strong>{session.level}</strong>
              </div>

              <div className="session-stats">
                <span>Turno <strong>{session.turn}</strong></span>
                <span>Cópias <strong>{progress.copies}</strong></span>
                <span>Sequência <strong>{streakSymbol} {progress.streak}/2</strong></span>
              </div>

              {!isPortuguesePrompt && (
                <button
                  className={`session-furigana-toggle${sessionFurigana ? ' is-active' : ''}`}
                  type="button"
                  aria-pressed={sessionFurigana}
                  onClick={() => setSessionFurigana((currentValue) => !currentValue)}
                >
                  <span>Furigana</span>
                  <strong>{sessionFurigana ? 'Visível' : 'Oculta'}</strong>
                </button>
              )}

              <div className="session-guidance">
                <span aria-hidden="true">語</span>
                <div>
                  <strong>{revealed ? 'Bateu com o que você lembrou?' : 'Segura o clique por um segundo.'}</strong>
                  <p>
                    {revealed
                      ? 'Julgue a lembrança, não a sua capacidade de criar uma desculpa convincente.'
                      : isPortuguesePrompt
                        ? 'Tente lembrar escrita e leitura antes de revelar.'
                        : 'Traduza mentalmente e só então abra a resposta.'}
                  </p>
                </div>
              </div>

              {revealed ? (
                <div className="answer-actions">
                  <button disabled={sessionBusy} className="wrong-answer" type="button" onClick={() => answer('wrong')}>✗ Errei</button>
                  <button disabled={sessionBusy} className="correct-answer" type="button" onClick={() => answer('correct')}>✓ Acertei</button>
                </div>
              ) : (
                <button className="console-reveal-button" type="button" onClick={() => setRevealed(true)}>Mostrar resposta</button>
              )}

              <p className="deck-rule">Duas respostas iguais alteram uma cópia. A palavra descansa por dois turnos depois de aparecer.</p>
            </aside>
          </div>

          {sessionError && <p className="trainer-error" role="alert">{sessionError}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="trainer-page vocabulary-trainer-page">
      <header className="trainer-header vocabulary-trainer-header">
        <Link className="kanji-home-link" href="/" aria-label="Voltar para a página inicial">
          <img src="/home-assets/cat-mark.png" alt="" />
          <span>Início</span>
        </Link>
        <span className="kanji-trainer-brand">
          <small>言葉の庭</small>
          <strong>Treino de vocabulário</strong>
        </span>
        <span className="kanji-header-mark"><img src="/home-assets/cat-profile.png" alt="" /></span>
      </header>

      <section className="trainer-selector vocabulary-selector">
        <div className="kanji-selector-intro vocabulary-selector-intro">
          <div>
            <p className="trainer-eyebrow">MONTE O BARALHO</p>
            <h1>Escolha como lembrar.</h1>
            <p>Treine reconhecimento ou produção usando apenas o vocabulário do JLPT salvo na base.</p>
          </div>
          <img src="/home-assets/mode-vocabulary.png" alt="Livros e portal japonês bordados em tecido" />
        </div>

        <div className="deck-selector-shell vocabulary-selector-shell">
          {resumableSession && (
            <div className="resume-session-banner">
              <div>
                <span>Sessão anterior</span>
                <strong>{resumableSession.level} · {directionLabel(resumableSession.direction)} · turno {resumableSession.turn}</strong>
              </div>
              <button type="button" onClick={continueSession}>Continuar treino</button>
            </div>
          )}

          {loading && <p className="trainer-message">Carregando o vocabulário…</p>}
          {loadError && <p className="trainer-error" role="alert">{loadError}</p>}

          {!loading && !loadError && catalog && (
            <>
              <section className="vocabulary-choice-section" aria-labelledby="vocabulary-level-title">
                <div className="vocabulary-choice-heading">
                  <span>01</span>
                  <div>
                    <h2 id="vocabulary-level-title">Nível JLPT</h2>
                    <p>As palavras permanecem no nível atribuído pelo OpenJLPT.</p>
                  </div>
                </div>
                <div className="level-grid vocabulary-level-grid">
                  {JLPT_LEVELS.map((level) => (
                    <button
                      className={selectedLevel === level ? 'is-selected' : ''}
                      type="button"
                      key={level}
                      disabled={(catalog.curatedCounts[level] ?? 0) !== (catalog.counts[level] ?? 0)}
                      onClick={() => setSelectedLevel(level)}
                    >
                      <strong>{level}</strong>
                      <span>
                        {(catalog.curatedCounts[level] ?? 0) === (catalog.counts[level] ?? 0)
                          ? `${catalog.counts[level] ?? 0} palavras`
                          : 'em curadoria'}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="vocabulary-choice-section" aria-labelledby="vocabulary-direction-title">
                <div className="vocabulary-choice-heading">
                  <span>02</span>
                  <div>
                    <h2 id="vocabulary-direction-title">Direção do treino</h2>
                    <p>Reconhecer e produzir são memórias diferentes; o progresso também será.</p>
                  </div>
                </div>
                <div className="direction-grid">
                  <button
                    className={direction === 'jp_to_pt' ? 'is-selected' : ''}
                    type="button"
                    onClick={() => setDirection('jp_to_pt')}
                  >
                    <span>RECONHECIMENTO</span>
                    <strong><b>日本語</b><i>→</i><b>Português</b></strong>
                    <p>Veja a palavra japonesa e lembre o significado.</p>
                  </button>
                  <button
                    className={direction === 'pt_to_jp' ? 'is-selected' : ''}
                    type="button"
                    onClick={() => setDirection('pt_to_jp')}
                  >
                    <span>PRODUÇÃO</span>
                    <strong><b>Português</b><i>→</i><b>日本語</b></strong>
                    <p>Veja o significado e puxe a palavra japonesa da memória.</p>
                  </button>
                </div>
              </section>

              {direction === 'jp_to_pt' && (
                <section className="vocabulary-choice-section furigana-choice" aria-labelledby="furigana-title">
                  <div className="vocabulary-choice-heading">
                    <span>03</span>
                    <div>
                      <h2 id="furigana-title">Furigana na pergunta</h2>
                      <p>A leitura sempre aparece depois de revelar a resposta.</p>
                    </div>
                  </div>
                  <div className="furigana-segmented" role="group" aria-label="Mostrar furigana">
                    <button className={showFurigana ? 'is-selected' : ''} type="button" onClick={() => setShowFurigana(true)}>
                      Sim <span>語彙（ごい）</span>
                    </button>
                    <button className={!showFurigana ? 'is-selected' : ''} type="button" onClick={() => setShowFurigana(false)}>
                      Não <span>語彙</span>
                    </button>
                  </div>
                </section>
              )}

              <div className="vocabulary-start-row">
                <div>
                  <span>{Object.values(catalog.curatedCounts).reduce((sum, count) => sum + count, 0)} palavras disponíveis</span>
                  <p>O baralho começa com três cópias de cada palavra.</p>
                </div>
                <button
                  className="start-training"
                  type="button"
                  disabled={!selectedLevel || !direction || sessionBusy}
                  onClick={startTraining}
                >
                  {sessionBusy ? 'Embaralhando…' : 'Começar treino'}
                </button>
              </div>
            </>
          )}

          {sessionError && <p className="trainer-error" role="alert">{sessionError}</p>}
        </div>
      </section>
    </main>
  );
}
