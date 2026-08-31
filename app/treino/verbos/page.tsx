'use client';

import Link from 'next/link';
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
      .catch(() => setLoadError('Não foi possível carregar o banco de verbos.'))
      .finally(() => setLoading(false));
  }, []);

  const current = useMemo(
    () => data?.verbs.find((verb) => verb.id === currentId) ?? null,
    [currentId, data],
  );

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

  return (
    <main className="trainer-page transitivity-page">
      <header className="trainer-header">
        <Link href="/">← Início</Link>
        <strong>Transitivo × intransitivo</strong>
        {activeLevel ? <button type="button" onClick={leaveSession}>Trocar nível</button> : <span />}
      </header>

      {!activeLevel ? (
        <section className="trainer-selector transitivity-selector">
          <p className="trainer-eyebrow">VERBO, OBJETO E A EMBOSCADA OCASIONAL</p>
          <h1>Escolha o nível JLPT</h1>
          <p>
            Diga se o verbo é transitivo, intransitivo ou se depende do uso.
            Depois da resposta, você recebe o significado e exemplos em português e japonês.
          </p>

          {loading && <p className="trainer-message">Abrindo o dicionário sem acordar os gramáticos…</p>}
          {loadError && <p className="trainer-error">{loadError}</p>}

          {data && !loadError && (
            <>
              <div className="verb-level-grid" aria-label="Níveis JLPT">
                {LEVELS.map((level) => (
                  <button
                    type="button"
                    className={selectedLevel === level ? 'is-selected' : ''}
                    aria-pressed={selectedLevel === level}
                    onClick={() => setSelectedLevel(level)}
                    key={level}
                  >
                    <span>JLPT</span>
                    <strong>{level}</strong>
                    <i>{data.byLevel[level]} verbos</i>
                  </button>
                ))}
              </div>
              <div className="verb-level-action">
                <button type="button" disabled={!selectedLevel} onClick={startTraining}>
                  {selectedLevel ? `Começar ${selectedLevel}` : 'Escolha um nível'}
                </button>
                <span>O progresso fica salvo neste dispositivo.</span>
              </div>
            </>
          )}
        </section>
      ) : current && session ? (
        <section className="transitivity-session">
          <div className="transitivity-stats" aria-label="Progresso da sessão">
            <span>NÍVEL<strong>{activeLevel}</strong></span>
            <span>RODADAS<strong>{answered}</strong></span>
            <span>ACERTOS<strong>{correct}</strong></span>
            <span>CÓPIAS<strong>{session.entries[current.id].copies}</strong></span>
          </div>

          <article className="transitivity-card">
            <div className="verb-prompt">
              <p>Este verbo é…</p>
              <h1 lang="ja">{current.word}</h1>
              <strong lang="ja">{current.reading}</strong>
              <span>{current.jlptLevel}</span>
            </div>

            <div className="classification-actions" aria-label="Escolha a classificação">
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
                    {CLASSIFICATION_LABELS[choice]}
                  </button>
                );
              })}
            </div>

            {answer !== null && wasCorrect !== null && (
              <section className="verb-reveal" aria-live="polite">
                <div className={`verb-result${wasCorrect ? ' is-correct' : ' is-wrong'}`}>
                  <span>{wasCorrect ? 'ACERTOU' : 'NÃO FOI DESSA VEZ'}</span>
                  <strong>{CLASSIFICATION_LABELS[current.classification]}</strong>
                </div>

                <div className="verb-meanings">
                  <div>
                    <span>PORTUGUÊS</span>
                    <p>{current.meaningPt}</p>
                    <small>{current.explanationPt}</small>
                  </div>
                  <div lang="ja">
                    <span>日本語</span>
                    <p>{current.meaningJa}</p>
                    <small>{current.explanationJa}</small>
                  </div>
                </div>

                <div className="verb-examples">
                  <h2>{current.examples.length > 1 ? 'Exemplos de uso' : 'Exemplo de uso'}</h2>
                  {current.examples.map((example, index) => (
                    <article key={`${example.role}-${index}`}>
                      <span>{CLASSIFICATION_LABELS[example.role]}</span>
                      <p lang="ja">{example.ja}</p>
                      <small>{example.pt}</small>
                    </article>
                  ))}
                </div>

                <button type="button" className="next-verb" onClick={nextVerb}>
                  Próximo verbo
                </button>
              </section>
            )}
          </article>
        </section>
      ) : null}
    </main>
  );
}
