'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { PersistedKanjiProgress } from './deck';
import {
  closeKanjiSession,
  createKanjiSession,
  fetchKanjiCatalog,
  importLegacyProgress,
  resumeKanjiSession,
  submitKanjiAnswer,
  type AnswerResult,
} from './api';
import type { KanjiGrouping as Grouping, KanjiRecord, KanjiSessionView } from './contracts';

const STORAGE_KEY = 'nihongo-kanji-progress-v1';
const SESSION_KEY = 'nihongo-kanji-session-v2';
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

export default function KanjiTrainerPage() {
  const [data, setData] = useState<KanjiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [grouping, setGrouping] = useState<Grouping>('jlpt');
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [session, setSession] = useState<KanjiSessionView | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [sessionBusy, setSessionBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const payload = await fetchKanjiCatalog();
        if (cancelled) return;
        setData(payload.kanji);

        const savedSessionId = window.localStorage.getItem(SESSION_KEY);
        if (savedSessionId) {
          const resumed = await resumeKanjiSession(savedSessionId);
          if (cancelled) return;
          if (resumed) setSession(resumed);
          else window.localStorage.removeItem(SESSION_KEY);
        }
      } catch {
        if (!cancelled) setLoadError('Não foi possível carregar o banco de kanjis.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void initialize();
    return () => { cancelled = true; };
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

  const currentKanji = session === null ? null : data.find((item) => item.id === session.currentId) ?? null;
  const currentEntry = session?.progress ?? null;

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

  async function startTraining() {
    const ids = advanced ? [...selectedIds] : levelKanji.map((item) => item.id);

    if (ids.length < 3) {
      setSessionError('Selecione pelo menos 3 kanjis para manter o bloqueio de dois turnos.');
      return;
    }

    setSessionBusy(true);
    try {
      await importLegacyProgress(loadProgress()).catch(() => undefined);
      const created = await createKanjiSession({
        grouping,
        level: selectedLevel!,
        ...(advanced ? { selectedIds: ids } : {}),
      });
      setSession(created);
      window.localStorage.setItem(SESSION_KEY, created.sessionId);
      setRevealed(false);
      setSessionError('');
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
      const updated = await submitKanjiAnswer({
        sessionId: session.sessionId,
        turn: session.turn,
        kanjiId: session.currentId,
        result,
      });
      setSession(updated);
      setRevealed(false);
      setSessionError('');
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'O servidor travou. Milagre estatístico ruim.');
    } finally {
      setSessionBusy(false);
    }
  }

  function leaveSession() {
    const sessionId = session?.sessionId;
    setSession(null);
    setRevealed(false);
    setSessionError('');
    window.localStorage.removeItem(SESSION_KEY);
    if (sessionId) void closeKanjiSession(sessionId).catch(() => undefined);
  }

  if (session && currentKanji && currentEntry) {
    const streakSymbol = currentEntry.lastResult === 'correct' ? '✓' : currentEntry.lastResult === 'wrong' ? '✗' : '—';

    return (
      <main className="trainer-page kanji-trainer-page">
        <header className="trainer-header kanji-trainer-header">
          <Link className="kanji-home-link" href="/" aria-label="Voltar para a página inicial">
            <img src="/home-assets/cat-mark.png" alt="" />
            <span>Início</span>
          </Link>
          <span className="kanji-trainer-brand">
            <small>漢字の庭</small>
            <strong>Treino de kanji</strong>
          </span>
          <button className="change-deck-button" type="button" onClick={leaveSession}>Trocar conjunto</button>
        </header>

        <section className="trainer-session" aria-live="polite">
          <div className="kanji-session-heading">
            <p className="trainer-eyebrow">SESSÃO EM ANDAMENTO</p>
            <h1>Olhe. Lembre. Revele.</h1>
            <p>Tente puxar o significado e as leituras da memória antes de abrir a carta.</p>
          </div>

          <div className="kanji-session-layout">
            <button
              className={`study-card${revealed ? ' is-revealed' : ''}`}
              type="button"
              onClick={() => setRevealed(true)}
              aria-label={revealed ? `Resposta do kanji ${currentKanji.kanji}` : 'Mostrar resposta'}
            >
              <img className="study-card-art" src="/mode-kanji-card-v2.png" alt="" aria-hidden="true" />
              <span className="study-card-content">
                <span className="study-character">{currentKanji.kanji}</span>

                {revealed ? (
                  <span className="study-answer">
                    <strong>{currentKanji.meaning}</strong>
                    <span><b>音読み</b> {currentKanji.onyomi || '—'}</span>
                    <span><b>訓読み</b> {currentKanji.kunyomi || '—'}</span>
                    <small>{currentKanji.jlpt ?? 'Sem JLPT'} · {currentKanji.grade}º ano</small>
                  </span>
                ) : (
                  <small className="reveal-hint">Toque para revelar</small>
                )}
              </span>
            </button>

            <aside className="session-console">
              <div className="session-console-heading">
                <span>Carta atual</span>
                <strong>{currentKanji.jlpt ?? `${currentKanji.grade}º ano`}</strong>
              </div>

              <div className="session-stats">
                <span>Turno <strong>{session.turn}</strong></span>
                <span>Cópias <strong>{currentEntry.copies}</strong></span>
                <span>Sequência <strong>{streakSymbol} {currentEntry.streak}/2</strong></span>
              </div>

              <div className="session-guidance">
                <span aria-hidden="true">学</span>
                <div>
                  <strong>{revealed ? 'Agora julgue sua resposta.' : 'Ainda não abra por reflexo.'}</strong>
                  <p>{revealed ? 'Marque com honestidade para o baralho ajustar a frequência.' : 'Diga o significado em voz alta — depois confira as leituras.'}</p>
                </div>
              </div>

              {revealed ? (
                <div className="answer-actions">
                  <button disabled={sessionBusy} className="wrong-answer" type="button" onClick={() => answer('wrong')}>✗ Errei</button>
                  <button disabled={sessionBusy} className="correct-answer" type="button" onClick={() => answer('correct')}>✓ Acertei</button>
                </div>
              ) : (
                <button className="console-reveal-button" type="button" onClick={() => setRevealed(true)}>Revelar resposta</button>
              )}

              <p className="deck-rule">Duas respostas iguais alteram uma cópia. O kanji descansa por dois turnos depois de aparecer.</p>
            </aside>
          </div>

          {sessionError && <p className="trainer-error" role="alert">{sessionError}</p>}
        </section>
      </main>
    );
  }

  const levels = grouping === 'jlpt' ? JLPT_LEVELS : SCHOOL_GRADES;

  return (
    <main className="trainer-page kanji-trainer-page">
      <header className="trainer-header kanji-trainer-header">
        <Link className="kanji-home-link" href="/" aria-label="Voltar para a página inicial">
          <img src="/home-assets/cat-mark.png" alt="" />
          <span>Início</span>
        </Link>
        <span className="kanji-trainer-brand">
          <small>漢字の庭</small>
          <strong>Treino de kanji</strong>
        </span>
        <span className="kanji-header-mark"><img src="/home-assets/cat-profile.png" alt="" /></span>
      </header>

      <section className="trainer-selector kanji-selector">
        <div className="kanji-selector-intro">
          <div>
            <p className="trainer-eyebrow">ESCOLHA O BARALHO</p>
            <h1>Comece pelo conjunto certo.</h1>
            <p>Escolha por JLPT ou série escolar. Cada kanji entra no baralho com três cópias e vai ganhando ou perdendo presença conforme suas respostas.</p>
          </div>
          <img src="/mode-kanji.png" alt="Gato bordado com cartões de estudo e pincel" />
        </div>

        <div className="deck-selector-shell">
          <div className="deck-selector-topline">
            <div>
              <span>Organizar conjunto</span>
              <strong>{grouping === 'jlpt' ? 'Níveis JLPT' : 'Séries escolares'}</strong>
            </div>
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
                Série escolar
              </button>
            </div>
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
                  <button className="start-training" type="button" disabled={sessionBusy} onClick={startTraining}>
                    {sessionBusy ? 'Abrindo sessão…' : `Começar com ${advanced ? selectedIds.size : levelKanji.length} kanjis`}
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
        </div>
      </section>
    </main>
  );
}
