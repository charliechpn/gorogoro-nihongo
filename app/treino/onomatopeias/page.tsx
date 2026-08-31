'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
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
      .catch(() => setLoadError('Não foi possível carregar o banco de onomatopeias.'))
      .finally(() => setLoading(false));
  }, []);

  const current = useMemo(
    () => entries.find((entry) => entry.id === currentId) ?? null,
    [currentId, entries],
  );

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

  return (
    <main className="trainer-page onomatopoeia-page">
      <header className="trainer-header">
        <Link href="/">← Início</Link>
        <strong>Onomatopeias</strong>
        {difficulty ? <button type="button" onClick={leaveSession}>Trocar modo</button> : <span />}
      </header>

      {!difficulty ? (
        <section className="trainer-selector onomatopoeia-selector">
          <p className="trainer-eyebrow">SOM, ESTADO E SENSAÇÃO</p>
          <h1>Como você quer apanhar hoje?</h1>
          <p>
            Nos dois modos, as onomatopeias erradas ganham cópias no baralho e voltam mais.
            As dominadas aparecem menos, mas nunca somem.
          </p>

          {loading && <p className="trainer-loading">Carregando o barulho organizado…</p>}
          {loadError && <p className="trainer-error">{loadError}</p>}

          {!loading && !loadError && (
            <div className="difficulty-grid">
              <button type="button" onClick={() => startTraining('easy')}>
                <span>FÁCIL</span>
                <strong>Escolha o significado</strong>
                <p>Uma resposta correta e duas distrações tiradas do banco completo.</p>
                <i>3 opções · correção automática</i>
              </button>
              <button type="button" onClick={() => startTraining('hard')}>
                <span>DIFÍCIL</span>
                <strong>Escreva o que lembra</strong>
                <p>Você escreve em português, confere as definições e julga a própria resposta.</p>
                <i>Resposta livre · sem juiz robótico</i>
              </button>
            </div>
          )}
        </section>
      ) : current && session ? (
        <section className="onomatopoeia-session">
          <div className="onomatopoeia-stats" aria-label="Progresso da sessão">
            <span>RODADAS<strong>{answered}</strong></span>
            <span>ACERTOS<strong>{correct}</strong></span>
            <span>CÓPIAS<strong>{session.entries[current.id].copies}</strong></span>
          </div>

          <article className="onomatopoeia-card">
            <div className="onomatopoeia-prompt">
              <p>{difficulty === 'easy' ? 'Qual é o significado?' : 'O que isso significa?'}</p>
              <h1>{current.term}</h1>
              <div className="onomatopoeia-categories">
                {current.categories.map((category) => (
                  <span key={category}>{CATEGORY_LABELS[category] ?? category}</span>
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
                      {choice.text}
                    </button>
                  );
                })}
              </div>
            ) : (
              <form className="hard-answer-form" onSubmit={revealHardAnswer}>
                <label htmlFor="onomatopoeia-answer">Seu significado em português</label>
                <textarea
                  id="onomatopoeia-answer"
                  value={typedAnswer}
                  disabled={revealed}
                  onChange={(event) => setTypedAnswer(event.target.value)}
                  placeholder="Escreva o que você lembra…"
                />
                {!revealed && <button type="submit">Conferir resposta</button>}
              </form>
            )}

            {revealed && (
              <section className="onomatopoeia-reveal" aria-live="polite">
                <div>
                  <span>PORTUGUÊS</span>
                  <p>{current.meaningPt}</p>
                </div>
                <div lang="ja">
                  <span>日本語</span>
                  <p>{current.meaningJa}</p>
                </div>

                {difficulty === 'hard' && selectedChoice === null && (
                  <div className="self-grade-actions">
                    <button type="button" className="wrong-answer" onClick={() => gradeHardAnswer('wrong')}>
                      Errei
                    </button>
                    <button type="button" className="correct-answer" onClick={() => gradeHardAnswer('correct')}>
                      Acertei
                    </button>
                  </div>
                )}

                {roundFinished && (
                  <button type="button" className="next-onomatopoeia" onClick={nextEntry}>
                    Próxima onomatopeia
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
