'use client';

import TrainingFlow from '../training-flow';
import SiteHeader from '@/app/site-header';
import ThemeArt from '@/app/theme-art';
import { useLanguage, useText } from '@/app/language';


import styles from './selection.module.css';
import practice from './practice.module.css';
import { useEffect, useMemo, useState } from 'react';
import {
  answerKanji,
  createDeckSession,
  drawNextKanji,
  extractPersistedProgress,
  type AnswerResult,
  type DeckSession,
  type PersistedKanjiProgress,
} from '../kanji/deck';
import {
  CLASSIFICATION_LABELS,
  isCorrectClassification,
  verbsForLevel,
  type JlptLevel,
  type TransitivityClassification,
  type TransitivityVerb,
} from './game';

type TransitivityData = {
  version: number;
  count: number;
  byLevel: Record<JlptLevel, number>;
  verbs: TransitivityVerb[];
};

const LEVELS: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];
const ANSWERS: TransitivityClassification[] = ['transitive', 'intransitive', 'depends'];
const ENGLISH_CLASSIFICATION_LABELS: Record<TransitivityClassification, string> = {
  transitive: 'Transitive',
  intransitive: 'Intransitive',
  depends: 'Depends',
};
const STORAGE_KEY = 'nihongo-transitivity-progress-v1';

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

export default function TransitivityTrainerPage() {
  const language = useLanguage();
  const t = useText();
  const classificationLabel = (value: TransitivityClassification) => t(CLASSIFICATION_LABELS[value], ENGLISH_CLASSIFICATION_LABELS[value]);
  const [data, setData] = useState<TransitivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<JlptLevel | null>(null);
  const [activeLevel, setActiveLevel] = useState<JlptLevel | null>(null);
  const [session, setSession] = useState<DeckSession | null>(null);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [answer, setAnswer] = useState<TransitivityClassification | null>(null);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);

  useEffect(() => {
    fetch('/data/transitivity.json')
      .then((response) => {
        if (!response.ok) throw new Error('Falha ao carregar os verbos.');
        return response.json() as Promise<TransitivityData>;
      })
      .then(setData)
      .catch(() => setLoadError('catalog'))
      .finally(() => setLoading(false));
  }, []);

  const current = useMemo(
    () => data?.verbs.find((verb) => verb.id === currentId) ?? null,
    [currentId, data],
  );
  const hasEnglishContent = language === 'en' && Boolean(current?.meaningEn);

  function startTraining() {
    if (!data || !selectedLevel) return;
    const levelVerbs = verbsForLevel(data.verbs, selectedLevel);
    const initial = createDeckSession(levelVerbs.map((verb) => verb.id), loadProgress());
    const draw = drawNextKanji(initial);
    setActiveLevel(selectedLevel);
    setSession(draw.session);
    setCurrentId(draw.kanjiId);
    setAnswer(null);
    setWasCorrect(null);
    setAnswered(0);
    setCorrect(0);
  }

  function chooseClassification(choice: TransitivityClassification) {
    if (!current || !session || answer !== null) return;
    const matched = isCorrectClassification(current, choice);
    const result: AnswerResult = matched ? 'correct' : 'wrong';
    const updated = answerKanji(session, current.id, result);
    setSession(updated);
    saveProgress(updated);
    setAnswer(choice);
    setWasCorrect(matched);
    setAnswered((value) => value + 1);
    if (matched) setCorrect((value) => value + 1);
  }

  function nextVerb() {
    if (!session) return;
    const draw = drawNextKanji(session);
    setSession(draw.session);
    setCurrentId(draw.kanjiId);
    setAnswer(null);
    setWasCorrect(null);
  }

  function leaveSession() {
    setActiveLevel(null);
    setSession(null);
    setCurrentId(null);
    setAnswer(null);
    setWasCorrect(null);
  }

  if (!activeLevel) {
    return (
      <main className="kanji-selection-page">
        <ThemeArt className="kanji-corner-tree" src="/kanji-assets/tree.webp" darkSrc="/kanji-assets/tree-dark.webp" alt="" aria-hidden="true" />
        <SiteHeader homeLink /><TrainingFlow step={session ? currentId ?? 'selection' : 'selection'} revealed={answer !== null} />
        <div className="kanji-selection-content">
          <section className="kanji-selection-hero" aria-labelledby="verbs-title">
            <div className="kanji-selection-copy">
              <p className="eyebrow">{t('TRANSITIVO × INTRANSITIVO', 'TRANSITIVE × INTRANSITIVE')}</p>
              <h1 id="verbs-title">{t('Verbos em pares', 'Verb pairs')}</h1>
              <p className="kanji-selection-description">{t('Escolha um nível e pratique os verbos.', 'Choose a level and practice classifying verbs.')}<br />{t('Transitivo, intransitivo ou depende do uso?', 'Transitive, intransitive, or does it depend on context?')}</p>
            </div>
          </section>
          <section className="kanji-level-selection" aria-labelledby="verbs-level-title">
            <h2 id="verbs-level-title">{t('Por JLPT', 'By JLPT')}</h2>
            <p>{t('Escolha o conjunto de verbos para praticar.', 'Choose a verb set to practice.')}</p>
            {loading && <p className="kanji-selection-status" role="status">{t('Carregando os verbos…', 'Loading verbs…')}</p>}
            {loadError && <p className="trainer-error" role="alert">{t('Não foi possível carregar o banco de verbos.', 'Could not load the verb database.')}</p>}
            {data && !loadError && <>
              <div className={'kanji-art-grid kanji-art-grid--jlpt ' + styles.levels} role="group" aria-label={t('Níveis JLPT', 'JLPT levels')}>
                {LEVELS.map((level) => (
                  <div className={styles.level} key={level}>
                    <button className="kanji-art-card" type="button" aria-pressed={selectedLevel === level}
                      aria-label={t(level + ', ' + data.byLevel[level] + ' verbos', level + ', ' + data.byLevel[level] + ' verbs')} onClick={() => setSelectedLevel(level)}>
                      <ThemeArt src={'/kanji-assets/jlpt-' + level + '.webp'} darkSrc={'/kanji-assets/jlpt-' + level + '-dark.webp'} alt="" />
                      {selectedLevel === level && <span className="kanji-selection-check" aria-hidden="true">✓</span>}
                    </button>
                    <span className={styles.count}>{t(data.byLevel[level] + ' verbos', data.byLevel[level] + ' verbs')}</span>
                  </div>
                ))}
              </div>
              <div className="kanji-selection-actions">
                <button className="kanji-begin" type="button" disabled={!selectedLevel} onClick={startTraining}>
                  {selectedLevel ? t('Começar ' + selectedLevel, 'Start ' + selectedLevel) : t('Escolha um nível', 'Choose a level')} <span aria-hidden="true">→</span>
                </button>
                <p className={styles.note}>{t('O progresso fica salvo neste dispositivo.', 'Progress is saved on this device.')}</p>
              </div>
            </>}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={practice.page}>
      <div className={practice.scenery} aria-hidden="true"><ThemeArt className={practice.garden} data-scenery="garden" src="/kanji-assets/practice-garden.png" darkSrc="/kanji-assets/practice-garden-dark.webp" alt="" /><ThemeArt className={practice.mountains} src="/kanji-assets/practice-mountains.png" darkSrc="/kanji-assets/practice-mountains-dark.webp" alt="" /><ThemeArt className={practice.brush} src="/kanji-assets/practice-brush.png" darkSrc="/kanji-assets/practice-brush-dark.webp" alt="" /></div>
      <SiteHeader homeLink onChangeSet={leaveSession} /><TrainingFlow step={session ? currentId ?? 'selection' : 'selection'} revealed={answer !== null} />

      {current && session ? (
        <section className="transitivity-session" aria-label={t('Treino de verbos em pares', 'Verb pair practice')}>

          <h1 className={practice.heading}>{t('Verbos em pares', 'Verb pairs')}</h1>
          <div className="transitivity-stats" aria-label={t('Progresso da sessão', 'Session progress')}>
            <span>{t('NÍVEL', 'LEVEL')}<strong>{activeLevel}</strong></span>
            <span>{t('RODADAS', 'ROUNDS')}<strong>{answered}</strong></span>
            <span>{t('ACERTOS', 'CORRECT')}<strong>{correct}</strong></span>
          </div>

          <article className={`transitivity-card${answer !== null ? ' is-revealed' : ''}`}>
            <div className="verb-prompt">
              <p>{t('Este verbo é…', 'This verb is…')}</p>
              <h2 lang="ja">{current.word}</h2>
              <strong lang="ja">{current.reading}</strong>
              <span>{current.jlptLevel}</span>
            </div>

            <div className="classification-actions" aria-label={t('Escolha a classificação', 'Choose a classification')}>
              {ANSWERS.map((choice, index) => {
                const className = answer === null
                  ? ''
                  : choice === current.classification
                    ? 'is-correct'
                    : choice === answer
                      ? 'is-wrong'
                      : 'is-muted';
                return (
                  <button
                    type="button"
                    className={className}
                    disabled={answer !== null}
                    onClick={() => chooseClassification(choice)}
                    key={choice}
                  >
                    <small>{index + 1}</small>
                    {classificationLabel(choice)}
                  </button>
                );
              })}
            </div>

            {answer !== null && wasCorrect !== null && (
              <section className="verb-reveal" aria-live="polite">
                <div data-training-answer className={`verb-result${wasCorrect ? ' is-correct' : ' is-wrong'}`}>
                  <span>{wasCorrect ? t('ACERTOU', 'CORRECT') : t('NÃO FOI DESSA VEZ', 'NOT THIS TIME')}</span>
                  <strong>{classificationLabel(current.classification)}</strong>
                </div>

                <button type="button" className="next-verb" onClick={nextVerb}>
                  {t('Próximo verbo', 'Next verb')}
                </button>

                <div className="verb-meanings">
                  <div>
                    <span>{hasEnglishContent ? 'ENGLISH' : t('PORTUGUÊS', 'PORTUGUESE')}</span>
                    <p lang={hasEnglishContent ? 'en' : 'pt-BR'}>{hasEnglishContent ? current.meaningEn : current.meaningPt}</p>
                    <small lang={hasEnglishContent ? 'en' : 'pt-BR'}>{hasEnglishContent ? current.explanationEn : current.explanationPt}</small>
                  </div>
                  <div lang="ja">
                    <span>日本語</span>
                    <p>{current.meaningJa}</p>
                    <small>{current.explanationJa}</small>
                  </div>
                </div>

                <div className="verb-examples">
                  <h2>{current.examples.length > 1 ? t('Exemplos de uso', 'Usage examples') : t('Exemplo de uso', 'Usage example')}</h2>
                  {current.examples.map((example, index) => (
                    <article key={`${example.role}-${index}`}>
                      <span>{classificationLabel(example.role)}</span>
                      <p lang="ja">{example.ja}</p>
                      <small lang={hasEnglishContent ? 'en' : 'pt-BR'}>{hasEnglishContent ? example.en : example.pt}</small>
                    </article>
                  ))}
                </div>


              </section>
            )}
          </article>
        </section>
      ) : null}
    </main>
  );
}
