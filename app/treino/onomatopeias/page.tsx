'use client';

import TrainingFlow from '../training-flow';
import SiteHeader from '@/app/site-header';
import ThemeArt from '@/app/theme-art';
import { useLanguage, useText } from '@/app/language';


import { useEffect, useMemo, useState, type FormEvent } from 'react';
import styles from './selection.module.css';
import practice from './practice.module.css';
import {
  answerKanji,
  createDeckSession,
  drawNextKanji,
  extractPersistedProgress,
  type AnswerResult,
  type DeckSession,
  type PersistedKanjiProgress,
} from '../kanji/deck';
import { createMeaningChoices, type OnomatopoeiaEntry } from './game';

type OnomatopoeiaData = {
  version: number;
  count: number;
  onomatopoeia: OnomatopoeiaEntry[];
};

type Difficulty = 'easy' | 'hard';

const STORAGE_KEY = 'nihongo-onomatopoeia-progress-v2';

const CATEGORY_LABELS: Record<string, string> = {
  giongo: '擬音語',
  giseigo: '擬声語',
  gitaigo: '擬態語',
  gijougo: '擬情語',
  giseijougo: '擬声情語',
  giongo_verb: '表現＋動詞',
};

function loadProgress(): Record<number, PersistedKanjiProgress> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProgress(session: DeckSession) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(extractPersistedProgress(session)),
  );
}

export default function OnomatopoeiaTrainerPage() {
  const t = useText();
  const language = useLanguage();
  const [entries, setEntries] = useState<OnomatopoeiaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [session, setSession] = useState<DeckSession | null>(null);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);

  useEffect(() => {
    fetch('/data/onomatopoeia.json')
      .then((response) => {
        if (!response.ok) throw new Error('Falha ao carregar as onomatopeias.');
        return response.json() as Promise<OnomatopoeiaData>;
      })
      .then((payload) => setEntries(payload.onomatopoeia))
      .catch(() => setLoadError('catalog'))
      .finally(() => setLoading(false));
  }, []);

  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  const current = currentId === null ? null : entryById.get(currentId) ?? null;

  const choices = useMemo(
    () => currentId === null || difficulty !== 'easy'
      ? []
      : createMeaningChoices(entries, currentId),
    [currentId, difficulty, entries],
  );

  function startTraining(mode: Difficulty) {
    const initial = createDeckSession(entries.map((entry) => entry.id), loadProgress());
    const draw = drawNextKanji(initial);
    setDifficulty(mode);
    setSession(draw.session);
    setCurrentId(draw.kanjiId);
    setSelectedChoice(null);
    setTypedAnswer('');
    setRevealed(false);
    setAnswered(0);
    setCorrect(0);
  }

  function applyResult(result: AnswerResult) {
    if (!session || currentId === null) return;
    const updated = answerKanji(session, currentId, result);
    setSession(updated);
    saveProgress(updated);
    setAnswered((value) => value + 1);
    if (result === 'correct') setCorrect((value) => value + 1);
  }

  function chooseAnswer(choiceId: number) {
    if (selectedChoice !== null || currentId === null) return;
    setSelectedChoice(choiceId);
    setRevealed(true);
    applyResult(choiceId === currentId ? 'correct' : 'wrong');
  }

  function revealHardAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!typedAnswer.trim()) return;
    setRevealed(true);
  }

  function gradeHardAnswer(result: AnswerResult) {
    if (!revealed) return;
    applyResult(result);
    setSelectedChoice(result === 'correct' ? currentId : -1);
  }

  function nextEntry() {
    if (!session) return;
    const draw = drawNextKanji(session);
    setSession(draw.session);
    setCurrentId(draw.kanjiId);
    setSelectedChoice(null);
    setTypedAnswer('');
    setRevealed(false);
  }

  function leaveSession() {
    setDifficulty(null);
    setSession(null);
    setCurrentId(null);
    setSelectedChoice(null);
    setTypedAnswer('');
    setRevealed(false);
  }

  const roundFinished = difficulty === 'easy'
    ? selectedChoice !== null
    : selectedChoice !== null;

  if (!difficulty) {
    return (
      <main className="kanji-selection-page">
        <ThemeArt className="kanji-corner-tree" src="/kanji-assets/tree.webp" darkSrc="/kanji-assets/tree-dark.webp" alt="" aria-hidden="true" />
        <SiteHeader homeLink /><TrainingFlow step={session ? currentId ?? 'selection' : 'selection'} revealed={revealed} />
        <div className="kanji-selection-content">
          <section className="kanji-selection-hero" aria-labelledby="onomatopoeia-title">
            <div className="kanji-selection-copy">
              <p className="eyebrow">{t('SOM, ESTADO E SENSAÇÃO', 'SOUND, STATE, AND SENSATION')}</p>
              <h1 id="onomatopoeia-title">{t('Onomatopeias', 'Onomatopoeia')}</h1>
              <p className="kanji-selection-description">{t('Explore os sons e as sensações do japonês.', 'Explore Japanese sounds and sensations.')}<br />{t('Escolha como praticar no seu ritmo.', 'Choose how you want to practice.')}</p>
            </div>
          </section>
          <section className="kanji-level-selection" aria-labelledby="onomatopoeia-mode-title">
            <h2 id="onomatopoeia-mode-title">{t('Escolha o modo de treino', 'Choose a practice mode')}</h2>
            <p>{t('Reconheça o significado ou escreva o que você lembra.', 'Recognize the meaning or write what you remember.')}</p>
            {loading && <p className="kanji-selection-status" role="status">{t('Carregando as onomatopeias…', 'Loading onomatopoeia…')}</p>}
            {loadError && <p className="trainer-error" role="alert">{t('Não foi possível carregar o banco de onomatopeias.', 'Could not load the onomatopoeia database.')}</p>}
            {!loading && !loadError && (
              <div className={styles.modes}>
                <button className={styles.mode} type="button" onClick={() => startTraining('easy')}>
                  <span className={styles.difficulty}>{t('FÁCIL', 'EASY')}</span>
                  <strong>{t('Escolha o significado', 'Choose the meaning')}</strong>
                  <span className={styles.description}>{t('Leia a onomatopeia e escolha o significado entre três opções.', 'Read the onomatopoeia and choose its meaning from three options.')}</span>
                  <span className={styles.details}>{t('3 opções · correção automática', '3 choices · automatic grading')}</span>
                  <span className={styles.action}>{t('Começar treino', 'Start practice')} <span aria-hidden="true">→</span></span>
                </button>
                <button className={styles.mode} type="button" onClick={() => startTraining('hard')}>
                  <span className={styles.difficulty}>{t('DIFÍCIL', 'HARD')}</span>
                  <strong>{t('Escreva o que lembra', 'Write what you remember')}</strong>
                  <span className={styles.description}>{t('Escreva o significado em português, confira a definição e avalie sua resposta.', 'Write the meaning in English, check the definition, and grade your answer.')}</span>
                  <span className={styles.details}>{t('Resposta livre · autoavaliação', 'Free response · self-assessment')}</span>
                  <span className={styles.action}>{t('Começar treino', 'Start practice')} <span aria-hidden="true">→</span></span>
                </button>
              </div>
            )}
            <p className={styles.note}>{t('Nos dois modos, as palavras que você erra aparecem com mais frequência para reforçar a revisão.', 'In both modes, missed words appear more often for review.')}</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={practice.page}>
      <div className={practice.scenery} aria-hidden="true"><ThemeArt className={practice.garden} data-scenery="garden" src="/kanji-assets/practice-garden.png" darkSrc="/kanji-assets/practice-garden-dark.webp" alt="" /><ThemeArt className={practice.mountains} src="/kanji-assets/practice-mountains.png" darkSrc="/kanji-assets/practice-mountains-dark.webp" alt="" /><ThemeArt className={practice.brush} src="/kanji-assets/practice-brush.png" darkSrc="/kanji-assets/practice-brush-dark.webp" alt="" /></div>
      <SiteHeader homeLink onChangeSet={leaveSession} changeSetLabel={t('Trocar modo', 'Change mode')} /><TrainingFlow step={session ? currentId ?? 'selection' : 'selection'} revealed={revealed} />

      {current && session ? (
        <section className="onomatopoeia-session" aria-label={t('Treino de onomatopeias', 'Onomatopoeia practice')}>

          <h1 className={practice.heading}>{t('Onomatopeias', 'Onomatopoeia')}</h1>
          <p className={practice.context}>{difficulty === 'easy' ? t('Fácil · escolha o significado', 'Easy · choose the meaning') : t('Difícil · escreva o significado', 'Hard · write the meaning')}</p>
          <div className="onomatopoeia-stats" aria-label={t('Progresso da sessão', 'Session progress')}>
            <span>{t('RODADAS', 'ROUNDS')}<strong>{answered}</strong></span>
            <span>{t('ACERTOS', 'CORRECT')}<strong>{correct}</strong></span>
          </div>

          <article className="onomatopoeia-card">
            <div className="onomatopoeia-prompt">
              <p>{difficulty === 'easy' ? t('Qual é o significado?', 'What does it mean?') : t('O que isso significa?', 'What does it mean?')}</p>
              <h2 lang="ja">{current.term}</h2>
              <div className="onomatopoeia-categories">
                {current.categories.map((category) => (
                  <span key={category} lang="ja">{CATEGORY_LABELS[category] ?? category}</span>
                ))}
              </div>
            </div>

            {difficulty === 'easy' ? (
              <div className="meaning-choices">
                {choices.map((choice) => {
                  const state = selectedChoice === null
                    ? ''
                    : choice.isCorrect
                      ? ' is-correct'
                      : selectedChoice === choice.id
                        ? ' is-wrong'
                        : ' is-muted';
                  return (
                    <button
                      type="button"
                      className={state}
                      disabled={selectedChoice !== null}
                      onClick={() => chooseAnswer(choice.id)}
                      key={choice.id}
                    >
                      <span lang={language === 'pt' ? 'pt-BR' : 'en'}>{language === 'pt' ? choice.text : entryById.get(choice.id)?.meaningEn}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <form className="hard-answer-form" onSubmit={revealHardAnswer}>
                <label htmlFor="onomatopoeia-answer">{t('Seu significado em português', 'Your meaning in English')}</label>
                <textarea
                  id="onomatopoeia-answer"
                  value={typedAnswer}
                  disabled={revealed}
                  onChange={(event) => setTypedAnswer(event.target.value)}
                  placeholder={t('Escreva o que você lembra…', 'Write what you remember…')}
                />
                {!revealed && <button type="submit">{t('Conferir resposta', 'Check answer')}</button>}
              </form>
            )}

            {revealed && (
              <section className="onomatopoeia-reveal" data-training-answer aria-live="polite">
                <div>
                  <span>{t('PORTUGUÊS', 'ENGLISH')}</span>
                  <p lang={language === 'pt' ? 'pt-BR' : 'en'}>{language === 'pt' ? current.meaningPt : current.meaningEn}</p>
                </div>
                <div lang="ja">
                  <span>日本語</span>
                  <p>{current.meaningJa}</p>
                </div>

                {difficulty === 'hard' && selectedChoice === null && (
                  <div className="self-grade-actions">
                    <button type="button" className="wrong-answer" onClick={() => gradeHardAnswer('wrong')}>
                      {t('Errei', 'Missed it')}
                    </button>
                    <button type="button" className="correct-answer" onClick={() => gradeHardAnswer('correct')}>
                      {t('Acertei', 'Got it')}
                    </button>
                  </div>
                )}

                {roundFinished && (
                  <button type="button" className="next-onomatopoeia" onClick={nextEntry}>
                    {t('Próxima onomatopeia', 'Next onomatopoeia')}
                  </button>
                )}
              </section>
            )}
          </article>
        </section>
      ) : null}
    </main>
  );
}
