'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  buildAcceptedWordMap,
  gradeAnswers,
  shuffleIds,
  tokenizeAnswers,
  type GradedRound,
} from './game';

type KanjiRecord = {
  id: number;
  kanji: string;
  meaning: string;
  onyomi: string | null;
  kunyomi: string | null;
  grade: number;
  jlpt: string | null;
  fullWords: string[];
};

type KanjiData = {
  version: number;
  count: number;
  kanji: KanjiRecord[];
};

type Grouping = 'jlpt' | 'grade';

const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;
const SCHOOL_GRADES = ['1', '2', '3', '4', '5', '6'] as const;

export default function WordGamePage() {
  const [data, setData] = useState<KanjiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [grouping, setGrouping] = useState<Grouping>('jlpt');
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [queue, setQueue] = useState<number[] | null>(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<GradedRound | null>(null);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [answeredRounds, setAnsweredRounds] = useState(0);
  const [sessionError, setSessionError] = useState('');
  const [showPossibleWords, setShowPossibleWords] = useState(false);

  useEffect(() => {
    fetch('/data/kanji.json')
      .then((response) => {
        if (!response.ok) throw new Error('Falha ao carregar os kanjis.');
        return response.json() as Promise<KanjiData>;
      })
      .then((payload) => {
        setData(payload.kanji.map((item) => ({ ...item, fullWords: item.fullWords ?? [] })));
      })
      .catch(() => setLoadError('Não foi possível carregar o banco de kanjis.'))
      .finally(() => setLoading(false));
  }, []);

  const levelKanji = useMemo(() => {
    if (!selectedLevel) return [];

    return data.filter((item) => {
      const belongsToLevel = grouping === 'jlpt'
        ? item.jlpt === selectedLevel
        : item.grade === Number(selectedLevel);
      return belongsToLevel && item.fullWords.length > 0;
    });
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

  const currentId = queue?.[roundIndex] ?? null;
  const currentKanji = currentId === null
    ? null
    : data.find((item) => item.id === currentId) ?? null;
  const draftWords = useMemo(() => tokenizeAnswers(input).words, [input]);
  const possibleWords = useMemo(
    () => currentKanji ? [...buildAcceptedWordMap(currentKanji.fullWords).values()] : [],
    [currentKanji],
  );

  function chooseLevel(level: string) {
    const matching = data.filter((item) => {
      const belongsToLevel = grouping === 'jlpt'
        ? item.jlpt === level
        : item.grade === Number(level);
      return belongsToLevel && item.fullWords.length > 0;
    });

    setSelectedLevel(level);
    setSelectedIds(new Set(matching.map((item) => item.id)));
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

  function startSession() {
    const ids = advanced ? [...selectedIds] : levelKanji.map((item) => item.id);
    if (!ids.length) {
      setSessionError('Selecione pelo menos um kanji para começar.');
      return;
    }

    setQueue(shuffleIds(ids));
    setRoundIndex(0);
    setInput('');
    setResult(null);
    setTotalCorrect(0);
    setAnsweredRounds(0);
    setShowPossibleWords(false);
    setSessionError('');
  }

  function submitAnswers() {
    if (!currentKanji || result) return;
    const graded = gradeAnswers(currentKanji.kanji, input, currentKanji.fullWords);
    if (!graded.answers.length) {
      setSessionError('Escreva pelo menos uma palavra antes de enviar.');
      return;
    }

    setResult(graded);
    setTotalCorrect((current) => current + graded.correctCount);
    setAnsweredRounds((current) => current + 1);
    setSessionError('');
  }

  function nextRound() {
    setRoundIndex((current) => current + 1);
    setInput('');
    setResult(null);
    setShowPossibleWords(false);
    setSessionError('');
  }

  function leaveSession() {
    setQueue(null);
    setRoundIndex(0);
    setInput('');
    setResult(null);
    setShowPossibleWords(false);
    setSessionError('');
  }

  if (queue && roundIndex >= queue.length) {
    return (
      <main className="trainer-page word-game-page">
        <header className="trainer-header">
          <Link href="/" aria-label="Voltar para a página inicial">← Início</Link>
          <strong>Cite uma palavra</strong>
          <button type="button" onClick={leaveSession}>Trocar conjunto</button>
        </header>

        <section className="word-game-finish">
          <p className="trainer-eyebrow">SESSÃO CONCLUÍDA</p>
          <h1>O baralho acabou.</h1>
          <strong>{totalCorrect}</strong>
          <p>palavras corretas em {answeredRounds} kanjis, sem repetir nenhum deles.</p>
          <div>
            <button className="start-training" type="button" onClick={startSession}>Jogar novamente</button>
            <button className="advanced-toggle" type="button" onClick={leaveSession}>Escolher outro conjunto</button>
          </div>
        </section>
      </main>
    );
  }

  if (queue && currentKanji) {
    return (
      <main className="trainer-page word-game-page">
        <header className="trainer-header">
          <Link href="/" aria-label="Voltar para a página inicial">← Início</Link>
          <strong>Cite uma palavra</strong>
          <button type="button" onClick={leaveSession}>Trocar conjunto</button>
        </header>

        <section className="word-game-session" aria-live="polite">
          <div className="word-session-stats">
            <span>Kanji <strong>{roundIndex + 1}/{queue.length}</strong></span>
            <span>Acertos <strong>{totalCorrect}</strong></span>
            <span>Na base <strong>{possibleWords.length}</strong></span>
          </div>

          <section className="word-prompt" aria-labelledby="word-prompt-title">
            <p id="word-prompt-title">Escreva todas as palavras que lembrar com</p>
            <strong>{currentKanji.kanji}</strong>
            {result && (
              <div className="word-kanji-details">
                <b>{currentKanji.meaning}</b>
                <span>音 {currentKanji.onyomi || '—'}</span>
                <span>訓 {currentKanji.kunyomi || '—'}</span>
              </div>
            )}
          </section>

          {!result ? (
            <form
              className="word-answer-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitAnswers();
              }}
            >
              <label htmlFor="word-answers">Suas palavras</label>
              <textarea
                id="word-answers"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    submitAnswers();
                  }
                }}
                placeholder={`${currentKanji.kanji}を使う言葉…`}
                autoFocus
              />
              <p>Separe por <b>、</b>, vírgula ou quebra de linha. Ctrl + Enter envia.</p>

              {draftWords.length > 0 && (
                <div className="draft-word-chips" aria-label="Palavras detectadas">
                  {draftWords.map((word) => <span key={word}>{word}</span>)}
                </div>
              )}

              <button className="submit-words" type="submit">Enviar respostas</button>
            </form>
          ) : (
            <section className="word-result" aria-labelledby="word-result-title">
              <div className="word-score-line">
                <div>
                  <p id="word-result-title">RESULTADO</p>
                  <strong>{result.correctCount} {result.correctCount === 1 ? 'acerto' : 'acertos'}</strong>
                </div>
                <span>{result.answers.length} {result.answers.length === 1 ? 'resposta' : 'respostas'}</span>
              </div>

              <div className="graded-answers">
                {result.answers.map((answer) => (
                  <div className={`graded-answer is-${answer.status}`} key={answer.word}>
                    <strong>{answer.word}</strong>
                    {answer.status === 'correct' && <span>✓ {answer.matches.join(' · ')}</span>}
                    {answer.status === 'not-in-base' && <span>Não consta na base deste treino</span>}
                    {answer.status === 'missing-kanji' && <span>Não contém {currentKanji.kanji}</span>}
                  </div>
                ))}
              </div>

              {result.duplicateCount > 0 && (
                <p className="duplicate-note">
                  {result.duplicateCount} {result.duplicateCount === 1 ? 'repetição ignorada' : 'repetições ignoradas'}.
                </p>
              )}

              <button
                className="possible-words-toggle"
                type="button"
                aria-expanded={showPossibleWords}
                onClick={() => setShowPossibleWords((current) => !current)}
              >
                {showPossibleWords ? 'Ocultar palavras da base' : `Ver ${possibleWords.length} palavras possíveis`}
              </button>

              {showPossibleWords && (
                <div className="possible-words-list">
                  {possibleWords.map((matches) => (
                    <span key={matches[0]}>{matches.join(' / ')}</span>
                  ))}
                </div>
              )}

              <button className="next-kanji" type="button" onClick={nextRound}>
                {roundIndex + 1 === queue.length ? 'Ver resultado da sessão' : 'Próximo kanji'}
              </button>
            </section>
          )}

          {sessionError && <p className="trainer-error" role="alert">{sessionError}</p>}
        </section>
      </main>
    );
  }

  const levels = grouping === 'jlpt' ? JLPT_LEVELS : SCHOOL_GRADES;

  return (
    <main className="trainer-page word-game-page">
      <header className="trainer-header">
        <Link href="/" aria-label="Voltar para a página inicial">← Início</Link>
        <strong>Cite uma palavra</strong>
        <span>語彙</span>
      </header>

      <section className="trainer-selector">
        <p className="trainer-eyebrow">ESCOLHA O BARALHO</p>
        <h1>Com quais kanjis você quer jogar?</h1>
        <p>Um kanji aparece; você escreve todas as palavras que conseguir puxar da memória.</p>

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
                const count = data.filter((item) => {
                  const belongsToLevel = grouping === 'jlpt'
                    ? item.jlpt === level
                    : item.grade === Number(level);
                  return belongsToLevel && item.fullWords.length > 0;
                }).length;
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
                <button className="start-training" type="button" onClick={startSession}>
                  Jogar com {advanced ? selectedIds.size : levelKanji.length} kanjis
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
              <section className="advanced-picker" aria-labelledby="word-advanced-title">
                <div className="advanced-heading">
                  <div>
                    <h2 id="word-advanced-title">Seleção avançada</h2>
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
                  <table className="kanji-picker-table word-picker-table">
                    <thead>
                      <tr>
                        <th aria-label="Selecionado" />
                        <th>Kanji</th>
                        <th>Significado</th>
                        <th>Palavras</th>
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
                          <td>{buildAcceptedWordMap(item.fullWords).size}</td>
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
