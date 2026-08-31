'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  answerKanji,
  createDeckSession,
  drawNextKanji,
  extractPersistedProgress,
  type AnswerResult,
  type DeckSession,
  type PersistedKanjiProgress,
} from './deck';

type KanjiRecord = {
  id: number;
  kanji: string;
  meaning: string;
  onyomi: string | null;
  kunyomi: string | null;
  grade: number;
  jlpt: string | null;
};

type KanjiData = {
  version: number;
  count: number;
  kanji: KanjiRecord[];
};

type Grouping = 'jlpt' | 'grade';

const STORAGE_KEY = 'nihongo-kanji-progress-v1';
const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;
const SCHOOL_GRADES = ['1', '2', '3', '4', '5', '6'] as const;

function loadProgress(): Record<number, PersistedKanjiProgress> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProgress(progress: Record<number, PersistedKanjiProgress>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export default function KanjiTrainerPage() {
  const [data, setData] = useState<KanjiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [grouping, setGrouping] = useState<Grouping>('jlpt');
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [session, setSession] = useState<DeckSession | null>(null);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    fetch('/data/kanji.json')
      .then((response) => {
        if (!response.ok) throw new Error('Falha ao carregar os kanjis.');
        return response.json() as Promise<KanjiData>;
      })
      .then((payload) => setData(payload.kanji))
      .catch(() => setLoadError('Não foi possível carregar o banco de kanjis.'))
      .finally(() => setLoading(false));
  }, []);

  const levelKanji = useMemo(() => {
    if (!selectedLevel) return [];

    return data.filter((item) =>
      grouping === 'jlpt'
        ? item.jlpt === selectedLevel
        : item.grade === Number(selectedLevel),
    );
  }, [data, grouping, selectedLevel]);

  const visibleAdvancedKanji = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    if (!normalizedSearch) return levelKanji;

    return levelKanji.filter((item) =>
      [item.kanji, item.meaning, item.onyomi ?? '', item.kunyomi ?? '']
        .join(' ')
        .toLocaleLowerCase('pt-BR')
        .includes(normalizedSearch),
    );
  }, [levelKanji, search]);

  const currentKanji = currentId === null ? null : data.find((item) => item.id === currentId) ?? null;
  const currentEntry = currentId === null ? null : session?.entries[currentId] ?? null;

  function chooseLevel(level: string) {
    const matchingIds = data
      .filter((item) => grouping === 'jlpt' ? item.jlpt === level : item.grade === Number(level))
      .map((item) => item.id);

    setSelectedLevel(level);
    setSelectedIds(new Set(matchingIds));
    setAdvanced(false);
    setSearch('');
    setSessionError('');
  }

  function changeGrouping(nextGrouping: Grouping) {
    setGrouping(nextGrouping);
    setSelectedLevel(null);
    setSelectedIds(new Set());
    setAdvanced(false);
    setSearch('');
    setSessionError('');
  }

  function toggleKanji(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startTraining() {
    const ids = advanced ? [...selectedIds] : levelKanji.map((item) => item.id);

    if (ids.length < 3) {
      setSessionError('Selecione pelo menos 3 kanjis para manter o bloqueio de dois turnos.');
      return;
    }

    try {
      const created = createDeckSession(ids, loadProgress());
      const firstDraw = drawNextKanji(created);
      setSession(firstDraw.session);
      setCurrentId(firstDraw.kanjiId);
      setRevealed(false);
      setSessionError('');
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'Não foi possível iniciar o treino.');
    }
  }

  function answer(result: AnswerResult) {
    if (!session || currentId === null || !revealed) return;

    try {
      const answered = answerKanji(session, currentId, result);
      const persisted = {
        ...loadProgress(),
        ...extractPersistedProgress(answered),
      };
      saveProgress(persisted);

      const nextDraw = drawNextKanji(answered);
      setSession(nextDraw.session);
      setCurrentId(nextDraw.kanjiId);
      setRevealed(false);
      setSessionError('');
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'O baralho travou. Milagre estatístico ruim.');
    }
  }

  function leaveSession() {
    setSession(null);
    setCurrentId(null);
    setRevealed(false);
    setSessionError('');
  }

  if (session && currentKanji && currentEntry) {
    const streakSymbol = currentEntry.lastResult === 'correct' ? '✓' : currentEntry.lastResult === 'wrong' ? '✗' : '—';

    return (
      <main className="trainer-page">
        <header className="trainer-header">
          <Link href="/" aria-label="Voltar para a página inicial">← Início</Link>
          <strong>Treino de kanji</strong>
          <button type="button" onClick={leaveSession}>Trocar conjunto</button>
        </header>

        <section className="trainer-session" aria-live="polite">
          <div className="session-stats">
            <span>Turno <strong>{session.turn}</strong></span>
            <span>Cópias <strong>{currentEntry.copies}</strong></span>
            <span>Streak <strong>{streakSymbol} {currentEntry.streak}/2</strong></span>
          </div>

          <button
            className={`study-card${revealed ? ' is-revealed' : ''}`}
            type="button"
            onClick={() => setRevealed(true)}
            aria-label={revealed ? `Resposta do kanji ${currentKanji.kanji}` : 'Mostrar resposta'}
          >
            <span className="study-character">{currentKanji.kanji}</span>

            {revealed ? (
              <span className="study-answer">
                <strong>{currentKanji.meaning}</strong>
                <span><b>音読み</b> {currentKanji.onyomi || '—'}</span>
                <span><b>訓読み</b> {currentKanji.kunyomi || '—'}</span>
                <small>{currentKanji.jlpt ?? 'Sem JLPT'} · {currentKanji.grade}º ano</small>
              </span>
            ) : (
              <small className="reveal-hint">Clique para revelar</small>
            )}
          </button>

          {revealed && (
            <div className="answer-actions">
              <button className="wrong-answer" type="button" onClick={() => answer('wrong')}>✗ Errei</button>
              <button className="correct-answer" type="button" onClick={() => answer('correct')}>✓ Acertei</button>
            </div>
          )}

          {sessionError && <p className="trainer-error" role="alert">{sessionError}</p>}
        </section>
      </main>
    );
  }

  const levels = grouping === 'jlpt' ? JLPT_LEVELS : SCHOOL_GRADES;

  return (
    <main className="trainer-page">
      <header className="trainer-header">
        <Link href="/" aria-label="Voltar para a página inicial">← Início</Link>
        <strong>Treino de kanji</strong>
        <span>漢字</span>
      </header>

      <section className="trainer-selector">
        <p className="trainer-eyebrow">ESCOLHA O BARALHO</p>
        <h1>Qual conjunto você quer treinar?</h1>
        <p>Todos começam com 3 cópias. Acertos tiram cópias; erros colocam mais.</p>

        <div className="grouping-tabs" role="tablist" aria-label="Tipo de agrupamento">
          <button
            className={grouping === 'jlpt' ? 'is-active' : ''}
            type="button"
            onClick={() => changeGrouping('jlpt')}
          >
            Por JLPT
          </button>
          <button
            className={grouping === 'grade' ? 'is-active' : ''}
            type="button"
            onClick={() => changeGrouping('grade')}
          >
            Por série escolar
          </button>
        </div>

        {loading && <p className="trainer-message">Carregando os kanjis…</p>}
        {loadError && <p className="trainer-error" role="alert">{loadError}</p>}

        {!loading && !loadError && (
          <>
            <div className="level-grid">
              {levels.map((level) => {
                const count = data.filter((item) =>
                  grouping === 'jlpt' ? item.jlpt === level : item.grade === Number(level),
                ).length;
                const label = grouping === 'jlpt' ? level : `${level}º ano`;

                return (
                  <button
                    className={selectedLevel === level ? 'is-selected' : ''}
                    type="button"
                    key={level}
                    onClick={() => chooseLevel(level)}
                  >
                    <strong>{label}</strong>
                    <span>{count} kanjis</span>
                  </button>
                );
              })}
            </div>

            {selectedLevel && (
              <div className="selected-level-actions">
                <button className="start-training" type="button" onClick={startTraining}>
                  Começar com {advanced ? selectedIds.size : levelKanji.length} kanjis
                </button>
                <button
                  className="advanced-toggle"
                  type="button"
                  onClick={() => setAdvanced((value) => !value)}
                >
                  {advanced ? 'Fechar seleção avançada' : 'Avançado: escolher kanjis'}
                </button>
              </div>
            )}

            {advanced && selectedLevel && (
              <section className="advanced-picker" aria-labelledby="advanced-title">
                <div className="advanced-heading">
                  <div>
                    <h2 id="advanced-title">Seleção avançada</h2>
                    <p>{selectedIds.size} de {levelKanji.length} selecionados</p>
                  </div>
                  <input
                    type="search"
                    placeholder="Buscar kanji ou significado"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>

                <div className="advanced-tools">
                  <button type="button" onClick={() => setSelectedIds(new Set(levelKanji.map((item) => item.id)))}>
                    Selecionar todos
                  </button>
                  <button type="button" onClick={() => setSelectedIds(new Set())}>Limpar</button>
                </div>

                <div className="kanji-table-wrap">
                  <table className="kanji-picker-table">
                    <thead>
                      <tr>
                        <th aria-label="Selecionado" />
                        <th>Kanji</th>
                        <th>Significado</th>
                        <th>音読み</th>
                        <th>訓読み</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleAdvancedKanji.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(item.id)}
                              onChange={() => toggleKanji(item.id)}
                              aria-label={`Selecionar ${item.kanji}`}
                            />
                          </td>
                          <td><strong>{item.kanji}</strong></td>
                          <td>{item.meaning}</td>
                          <td>{item.onyomi || '—'}</td>
                          <td>{item.kunyomi || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}

        {sessionError && <p className="trainer-error" role="alert">{sessionError}</p>}
      </section>
    </main>
  );
}
