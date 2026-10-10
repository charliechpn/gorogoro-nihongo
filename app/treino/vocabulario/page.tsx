'use client';

import TrainingFlow from '../training-flow';
import SiteHeader from '@/app/site-header';
import ThemeArt from '@/app/theme-art';
import { useLanguage, useText } from '@/app/language';


import { useEffect, useRef, useState } from 'react';
import styles from './vocabulary.module.css';
import selection from './selection.module.css';
import {
  closeVocabularySession,
  createVocabularySession,
  fetchVocabularyCatalog,
  submitVocabularyAnswer,
  type AnswerResult,
} from './api';
import type {
  VocabularyCatalogResponse,
  VocabularyDirection,
  VocabularySessionView,
} from './contracts';

const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;

export default function VocabularyTrainerPage() {
  const t = useText();
  const language = useLanguage();
  const [catalog, setCatalog] = useState<VocabularyCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [direction, setDirection] = useState<VocabularyDirection | null>(null);
  const [showFurigana, setShowFurigana] = useState(true);
  const [sessionFurigana, setSessionFurigana] = useState(true);
  const [session, setSession] = useState<VocabularySessionView | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState<{ pt: string; en: string } | null>(null);
  const activeSessionId = useRef<string | null>(null);
  const mounted = useRef(false);
  const selectedHasEnglishContent = language === 'en';
  const selectedContentName = selectedHasEnglishContent ? 'English' : t('Português', 'Portuguese');

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const payload = await fetchVocabularyCatalog();
        if (cancelled) return;
        setCatalog(payload);
        try { window.localStorage.removeItem('nihongo-vocabulary-session-v2'); } catch { /* Storage may be unavailable. */ }
      } catch {
        if (!cancelled) setLoadError('catalog');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void initialize();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (activeSessionId.current) void closeVocabularySession(activeSessionId.current).catch(() => undefined);
    };
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
      if (!mounted.current) {
        void closeVocabularySession(created.sessionId).catch(() => undefined);
        return;
      }
      activeSessionId.current = created.sessionId;
      setSession(created);
      setSessionFurigana(created.showFurigana);
      setRevealed(false);
      setSessionError(null);
    } catch (error) {
      setSessionError({ pt: error instanceof Error ? error.message : 'Não foi possível iniciar o treino.', en: 'Could not start practice.' });
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
      setSessionError(null);
    } catch (error) {
      setSessionError({ pt: error instanceof Error ? error.message : 'Não foi possível salvar a resposta.', en: 'Could not save your answer.' });
    } finally {
      setSessionBusy(false);
    }
  }

  function leaveSession() {
    const sessionId = session?.sessionId;
    activeSessionId.current = null;
    setSession(null);
    setRevealed(false);
    setSessionError(null);
    if (sessionId) void closeVocabularySession(sessionId).catch(() => undefined);
  }

  if (session) {
    const { current } = session;
    const isPortuguesePrompt = session.direction === 'pt_to_jp';
    const hasEnglishContent = language === 'en' && Boolean(current.promptEn);
    const meaning = (hasEnglishContent ? current.meaningsEn : current.meaningsPt).join(' · ');
    const primaryMeaning = hasEnglishContent
      ? current.promptEn ?? current.meaningsEn[0]
      : current.promptPt ?? current.meaningsPt[0];
    const meaningLang = hasEnglishContent ? 'en' : 'pt-BR';

    return (
      <main className={styles.page}>
<div className={styles.scenery} aria-hidden="true">
          <ThemeArt className={styles.garden} data-scenery="garden" src="/kanji-assets/practice-garden.png" darkSrc="/kanji-assets/practice-garden-dark.webp" alt="" />
          <ThemeArt className={styles.mountains} src="/kanji-assets/practice-mountains.png" darkSrc="/kanji-assets/practice-mountains-dark.webp" alt="" />
          <ThemeArt className={styles.brush} src="/kanji-assets/practice-brush.png" darkSrc="/kanji-assets/practice-brush-dark.webp" alt="" />
        </div>
        <SiteHeader homeLink onChangeSet={leaveSession} /><TrainingFlow step={session ? session.turn : 'selection'} revealed={revealed} />

        <section className={styles.practice} aria-label={t('Treino de vocabulário', 'Vocabulary practice')}>

          <div className={styles.context}>
            <h1>{t('Vocabulário', 'Vocabulary')} <span aria-hidden="true">·</span> {session.level}</h1>
            <span>{t('Turno', 'Round')} {session.turn}</span>
          </div>
          <p className={styles.direction}>{session.direction === 'pt_to_jp'
            ? hasEnglishContent ? 'English → Japanese' : t('Português → japonês', 'Portuguese → Japanese')
            : hasEnglishContent ? 'Japanese → English' : t('Japonês → português', 'Japanese → Portuguese')}</p>
          <button className={styles.card} type="button" onClick={() => setRevealed(true)}
            aria-label={revealed ? t(`Resposta de ${current.word}`, `Answer for ${current.word}`) : t('Revelar resposta', 'Reveal answer')}>
            <span className={styles.cardContent}>
              {!revealed && isPortuguesePrompt && <strong className={styles.portuguese} lang={meaningLang}>{primaryMeaning}</strong>}
              {!revealed && !isPortuguesePrompt && <span className={styles.japanese} lang="ja"><ruby>{current.word}{sessionFurigana && <rt>{current.reading}</rt>}</ruby></span>}
              {revealed && <span className={styles.answer} data-training-answer>
                <strong className={styles.japanese} lang="ja">{current.word}</strong>
                <span className={styles.reading} lang="ja">{current.reading}</span>
                <span className={styles.meaning} lang={meaningLang}>{meaning}</span>
              </span>}
            </span>
          </button>
          <div className={styles.actions} aria-busy={sessionBusy}>
            {revealed ? <>
              <button disabled={sessionBusy} className={styles.correct} type="button" onClick={() => answer('correct')}>✓ {t('Acertei', 'Got it')}</button>
              <button disabled={sessionBusy} className={styles.wrong} type="button" onClick={() => answer('wrong')}>× {t('Errei', 'Missed it')}</button>
            </> : <button className={styles.reveal} type="button" onClick={() => setRevealed(true)}>{t('Revelar resposta', 'Reveal answer')}</button>}
          </div>
          <div className={styles.status} aria-live="polite">{sessionBusy && <p role="status">{t('Salvando resposta…', 'Saving answer…')}</p>}{sessionError && <p className="trainer-error" role="alert">{t(sessionError.pt, sessionError.en)}</p>}</div>
        </section>
      </main>
    );
  }

  return (
    <main className="kanji-selection-page">
      <ThemeArt className="kanji-corner-tree" src="/kanji-assets/tree.webp" darkSrc="/kanji-assets/tree-dark.webp" alt="" aria-hidden="true" />
      <SiteHeader homeLink /><TrainingFlow step="selection" />
      <div className="kanji-selection-content">
        <section className="kanji-selection-hero" aria-labelledby="vocabulary-title">
          <div className="kanji-selection-copy">
            <p className="eyebrow">{t('PALAVRAS NO DIA A DIA', 'WORDS FOR EVERYDAY USE')}</p>
            <h1 id="vocabulary-title">{t('Treino de vocabulário', 'Vocabulary practice')}</h1>
            <p className="kanji-selection-description">{t('Escolha um nível e a direção do treino.', 'Choose a level and practice direction.')}<br />{t('Pratique as palavras no seu ritmo.', 'Study words at your own pace.')}</p>
          </div>
        </section>
        <section className="kanji-level-selection" aria-labelledby="vocabulary-level-title">
          <h2 id="vocabulary-level-title">{t('Por JLPT', 'By JLPT')}</h2>
          <p>{t('Escolha o conjunto de palavras para praticar.', 'Choose a word set to practice.')}</p>
          {loading && <p className="kanji-selection-status" role="status">{t('Carregando o vocabulário…', 'Loading vocabulary…')}</p>}
          {loadError && <p className="trainer-error" role="alert">{t('Não foi possível carregar o vocabulário.', 'Could not load vocabulary.')}</p>}
          {!loading && !loadError && catalog && <>
            <div className={'kanji-art-grid kanji-art-grid--jlpt ' + selection.levels} role="group" aria-label={t('Níveis JLPT', 'JLPT levels')}>
              {JLPT_LEVELS.map((level) => (
                <div className={selection.level} key={level}>
                  <button className="kanji-art-card" type="button"
                    aria-pressed={selectedLevel === level}
                    aria-label={t(level + ', ' + (catalog.counts[level] ?? 0) + ' palavras', level + ', ' + (catalog.counts[level] ?? 0) + ' words')}
                    disabled={(catalog.curatedCounts[level] ?? 0) !== (catalog.counts[level] ?? 0)}
                    onClick={() => setSelectedLevel(level)}>
                    <ThemeArt src={'/kanji-assets/jlpt-' + level + '.webp'} darkSrc={'/kanji-assets/jlpt-' + level + '-dark.webp'} alt="" />
                    {selectedLevel === level && <span className="kanji-selection-check" aria-hidden="true">✓</span>}
                  </button>
                  <span className={selection.count}>{(catalog.curatedCounts[level] ?? 0) === (catalog.counts[level] ?? 0) ? t((catalog.counts[level] ?? 0) + ' palavras', (catalog.counts[level] ?? 0) + ' words') : t('em curadoria', 'being reviewed')}</span>
                </div>
              ))}
            </div>
            <div className={selection.options}>
              <div className={selection.optionHeading}>
                <h3 id="vocabulary-direction-title">{t('Direção do treino', 'Practice direction')}</h3>
                <button className={selection.furiganaSwitch} type="button" role="switch"
                  aria-label={t('Furigana na pergunta', 'Furigana on the prompt')} aria-checked={showFurigana}
                  disabled={direction !== 'jp_to_pt'}
                  title={selectedHasEnglishContent ? 'Available for Japanese to English practice' : t('Disponível no treino de japonês para português', 'Available for Japanese to Portuguese practice')}
                  onClick={() => setShowFurigana(value => !value)}>
                  <span>Furigana</span><span className={selection.switchTrack} aria-hidden="true" />
                </button>
              </div>
              <fieldset className={selection.direction} aria-labelledby="vocabulary-direction-title">
                <div className={selection.directions}>
                  <button type="button" aria-pressed={direction === 'jp_to_pt'} onClick={() => setDirection('jp_to_pt')}>
                    <strong><span lang="ja">日本語</span><span aria-hidden="true">→</span>{selectedContentName}</strong>
                    <span>{selectedHasEnglishContent ? 'Recall the English meaning.' : t('Lembre o significado.', 'Recall the Portuguese meaning.')}</span>
                  </button>
                  <button type="button" aria-pressed={direction === 'pt_to_jp'} onClick={() => setDirection('pt_to_jp')}>
                    <strong>{selectedContentName}<span aria-hidden="true">→</span><span lang="ja">日本語</span></strong>
                    <span>{t('Lembre a palavra japonesa.', 'Recall the Japanese word.')}</span>
                  </button>
                </div>
              </fieldset>

            </div>
            <div className="kanji-selection-actions">
              <button className="kanji-begin" type="button" disabled={!selectedLevel || !direction || sessionBusy} onClick={startTraining}>
                {sessionBusy ? t('Embaralhando…', 'Shuffling…') : !selectedLevel ? t('Escolha um nível', 'Choose a level') : !direction ? t('Escolha a direção', 'Choose a direction') : t('Começar ' + selectedLevel, 'Start ' + selectedLevel)}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </>}
          {sessionError && <p className="trainer-error" role="alert">{t(sessionError.pt, sessionError.en)}</p>}
        </section>
      </div>
    </main>
  );
}
