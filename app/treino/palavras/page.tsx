'use client';

import ReadingList from '../reading-list';
import KanjiPickerCard from '../kanji-picker-card';
import TrainingFlow from '../training-flow';
import SiteHeader from '@/app/site-header';
import ThemeArt from '@/app/theme-art';
import { useLanguage, useText } from '@/app/language';


import { useEffect, useMemo, useState } from 'react';
import styles from './selection.module.css';
import practice from './practice.module.css';
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
  meaningEn?: string | null;
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
  const t = useText();
  const language = useLanguage();
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
  const [sessionError, setSessionError] = useState<{ pt: string; en: string } | null>(null);
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
      .catch(() => setLoadError('catalog'))
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
    const locale = language === 'pt' ? 'pt-BR' : 'en';
    const normalizedSearch = search.trim().toLocaleLowerCase(locale);
    if (!normalizedSearch) return levelKanji;

    return levelKanji.filter((item) =>
      [item.kanji, language === 'pt' ? item.meaning : item.meaningEn ?? '', item.onyomi ?? '', item.kunyomi ?? '']
        .join(' ')
        .toLocaleLowerCase(locale)
        .includes(normalizedSearch),
    );
  }, [language, levelKanji, search]);

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
    setSessionError(null);
  }

  function changeGrouping(nextGrouping: Grouping) {
    setGrouping(nextGrouping);
    setSelectedLevel(null);
    setSelectedIds(new Set());
    setAdvanced(false);
    setSearch('');
    setSessionError(null);
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
      setSessionError({ pt: 'Selecione pelo menos um kanji para começar.', en: 'Select at least one kanji to start.' });
      return;
    }

    setQueue(shuffleIds(ids));
    setRoundIndex(0);
    setInput('');
    setResult(null);
    setTotalCorrect(0);
    setAnsweredRounds(0);
    setShowPossibleWords(false);
    setSessionError(null);
  }

  function submitAnswers() {
    if (!currentKanji || result) return;
    const graded = gradeAnswers(currentKanji.kanji, input, currentKanji.fullWords);
    if (!graded.answers.length) {
      setSessionError({ pt: 'Escreva pelo menos uma palavra antes de enviar.', en: 'Enter at least one word before submitting.' });
      return;
    }

    setResult(graded);
    setTotalCorrect((current) => current + graded.correctCount);
    setAnsweredRounds((current) => current + 1);
    setSessionError(null);
  }

  function nextRound() {
    setRoundIndex((current) => current + 1);
    setInput('');
    setResult(null);
    setShowPossibleWords(false);
    setSessionError(null);
  }

  function leaveSession() {
    setQueue(null);
    setRoundIndex(0);
    setInput('');
    setResult(null);
    setShowPossibleWords(false);
    setSessionError(null);
  }

  if (queue && roundIndex >= queue.length) {
    return (
      <main className={practice.page}><div className={practice.scenery} aria-hidden="true"><ThemeArt className={practice.garden} data-scenery="garden" src="/kanji-assets/practice-garden.png" darkSrc="/kanji-assets/practice-garden-dark.webp" alt="" /><ThemeArt className={practice.mountains} src="/kanji-assets/practice-mountains.png" darkSrc="/kanji-assets/practice-mountains-dark.webp" alt="" /><ThemeArt className={practice.brush} src="/kanji-assets/practice-brush.png" darkSrc="/kanji-assets/practice-brush-dark.webp" alt="" /></div>
        <SiteHeader homeLink /><TrainingFlow step={queue ? roundIndex : 'selection'} revealed={result !== null} />

        <section className="word-game-finish">
          <p className="trainer-eyebrow">{t('SESSÃO CONCLUÍDA', 'SESSION COMPLETE')}</p>
          <h1>{t('O baralho acabou.', 'You finished the deck.')}</h1>
          <strong>{totalCorrect}</strong>
          <p>{t(`${totalCorrect === 1 ? 'palavra correta' : 'palavras corretas'} em ${answeredRounds} ${answeredRounds === 1 ? 'kanji' : 'kanjis'}, sem repetir nenhum deles.`, `${totalCorrect === 1 ? 'correct word' : 'correct words'} across ${answeredRounds} kanji, with no repeats.`)}</p>
          <div>
            <button className="start-training" type="button" onClick={startSession}>{t('Jogar novamente', 'Play again')}</button>
            <button className="advanced-toggle" type="button" onClick={leaveSession}>{t('Escolher outro conjunto', 'Choose another set')}</button>
          </div>
        </section>
      </main>
    );
  }

  if (queue && currentKanji) {
    return (
      <main className={practice.page}><div className={practice.scenery} aria-hidden="true"><ThemeArt className={practice.garden} data-scenery="garden" src="/kanji-assets/practice-garden.png" darkSrc="/kanji-assets/practice-garden-dark.webp" alt="" /><ThemeArt className={practice.mountains} src="/kanji-assets/practice-mountains.png" darkSrc="/kanji-assets/practice-mountains-dark.webp" alt="" /><ThemeArt className={practice.brush} src="/kanji-assets/practice-brush.png" darkSrc="/kanji-assets/practice-brush-dark.webp" alt="" /></div>
        <SiteHeader homeLink onChangeSet={leaveSession} /><TrainingFlow step={queue ? roundIndex : 'selection'} revealed={result !== null} />

        <section className="word-game-session" aria-label={t('Cite uma palavra', 'Name a word')}>

          <h1 className={practice.heading}>{t('Cite uma palavra', 'Name a word')}</h1>
          <p className={practice.context}>{grouping === 'jlpt' ? 'JLPT · ' + selectedLevel : t('Série escolar · ' + selectedLevel + 'º ano', 'School grade · Grade ' + selectedLevel)}</p>
          <div className="word-session-stats">
            <span>Kanji <strong>{roundIndex + 1}/{queue.length}</strong></span>
            <span>{t('Acertos', 'Correct')} <strong>{totalCorrect}</strong></span>
            <span>{t('Palavras possíveis', 'Possible words')} <strong>{possibleWords.length}</strong></span>
          </div>

          <div className={practice.workspace}>
          <section className="word-prompt" aria-label={t('Kanji da rodada: ', 'Kanji for this round: ') + currentKanji.kanji}>
            <strong lang="ja">{currentKanji.kanji}</strong>
          </section>

          {!result ? (
            <form
              className="word-answer-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitAnswers();
              }}
            >
              <label htmlFor="word-answers">{t('Suas palavras', 'Your words')}</label>
              <p className={practice.instruction}>{t('Escreva as palavras que lembrar com este kanji.', 'Write Japanese words you know that contain this kanji.')}</p>
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
              />
              <p>{t('Separe por ', 'Separate with ')}<b>、</b>{t(', vírgula ou quebra de linha. Ctrl + Enter envia.', ', commas, or line breaks. Press Ctrl + Enter to submit.')}</p>

              {draftWords.length > 0 && (
                <div className="draft-word-chips" aria-label={t('Palavras detectadas', 'Detected words')}>
                  {draftWords.map((word) => <span key={word} lang="ja">{word}</span>)}
                </div>
              )}

              <button className="submit-words" type="submit">{t('Enviar respostas', 'Submit answers')}</button>
            </form>
          ) : (
            <section className="word-result" aria-labelledby="word-result-title" aria-live="polite">
              <div className={practice.kanjiSummary}>
                <p className={practice.meaning} lang={language === 'pt' ? 'pt-BR' : 'en'}>{language === 'pt' ? currentKanji.meaning : currentKanji.meaningEn}</p>
                <dl className={practice.readings}>
                  <div><dt>Onyomi</dt><dd lang="ja"><ReadingList value={currentKanji.onyomi} /></dd></div>
                  <div><dt>Kunyomi</dt><dd lang="ja"><ReadingList value={currentKanji.kunyomi} /></dd></div>
                </dl>
              </div>
              <div className="word-score-line" data-training-answer>
                <div>
                  <p id="word-result-title">{t('RESULTADO', 'RESULT')}</p>
                  <strong>{result.correctCount} {t(result.correctCount === 1 ? 'acerto' : 'acertos', result.correctCount === 1 ? 'correct word' : 'correct words')}</strong>
                </div>
                <span>{result.answers.length} {t(result.answers.length === 1 ? 'resposta' : 'respostas', result.answers.length === 1 ? 'answer' : 'answers')}</span>
              </div>

              <div className="graded-answers">
                {result.answers.map((answer) => (
                  <div className={`graded-answer is-${answer.status}`} key={answer.word}>
                    <strong lang="ja">{answer.word}</strong>
                    {answer.status === 'correct' && <span lang="ja">✓ {answer.matches.join(' · ')}</span>}
                    {answer.status === 'not-in-base' && <span>{t('Não consta no conjunto de palavras deste treino', 'Not in this practice word set')}</span>}
                    {answer.status === 'missing-kanji' && <span>{t('Não contém', 'Does not contain')} {currentKanji.kanji}</span>}
                  </div>
                ))}
              </div>

              {result.duplicateCount > 0 && (
                <p className="duplicate-note">
                  {result.duplicateCount} {t(result.duplicateCount === 1 ? 'repetição ignorada' : 'repetições ignoradas', result.duplicateCount === 1 ? 'duplicate ignored' : 'duplicates ignored')}.
                </p>
              )}

              <button
                className="possible-words-toggle"
                type="button"
                aria-expanded={showPossibleWords}
                onClick={() => setShowPossibleWords((current) => !current)}
              >
                {showPossibleWords ? t('Ocultar palavras da base', 'Hide words in this set') : t(`Ver ${possibleWords.length} palavras possíveis`, `Show ${possibleWords.length} possible words`)}
              </button>

              {showPossibleWords && (
                <div className="possible-words-list">
                  {possibleWords.map((matches) => (
                    <span key={matches[0]} lang="ja">{matches.join(' / ')}</span>
                  ))}
                </div>
              )}

              <button className="next-kanji" type="button" onClick={nextRound}>
                {roundIndex + 1 === queue.length ? t('Ver resultado da sessão', 'See session results') : t('Próximo kanji', 'Next kanji')}
              </button>
            </section>
          )}

          </div>
          {sessionError && <p className="trainer-error" role="alert">{t(sessionError.pt, sessionError.en)}</p>}
        </section>
      </main>
    );
  }

  const levels = grouping === 'jlpt' ? JLPT_LEVELS : SCHOOL_GRADES;

  return (
    <main className="kanji-selection-page">
      <ThemeArt className="kanji-corner-tree" src="/kanji-assets/tree.webp" darkSrc="/kanji-assets/tree-dark.webp" alt="" aria-hidden="true" />
      <SiteHeader homeLink /><TrainingFlow step={queue ? roundIndex : 'selection'} revealed={result !== null} />

      <div className="kanji-selection-content">
        <section className="kanji-selection-hero" aria-labelledby="word-selection-title">
          <div className="kanji-selection-copy">
            <p className="eyebrow">{t('PALAVRAS NA MEMÓRIA', 'WORDS FROM MEMORY')}</p>
            <h1 id="word-selection-title">{t('Cite uma palavra', 'Name a word')}</h1>
            <p className="kanji-selection-description">{t('Escolha um conjunto de kanjis e escreva', 'Choose a kanji set and write')}<br />{t('as palavras que você lembrar.', 'the Japanese words you remember.')}</p>

        <div className="kanji-group-switch" role="group" aria-label={t('Tipo de agrupamento', 'Group by')}>
          <button
            aria-pressed={grouping === 'jlpt'}
            type="button"
            onClick={() => changeGrouping('jlpt')}
          >
            {t('Por JLPT', 'By JLPT')}
          </button>
          <button
            aria-pressed={grouping === 'grade'}
            type="button"
            onClick={() => changeGrouping('grade')}
          >
            {t('Por série escolar', 'By school grade')}
          </button>
        </div>

          </div>
        </section>
        <section className="kanji-level-selection" aria-labelledby="word-group-title">
          <h2 id="word-group-title">{grouping === 'jlpt' ? t('Por JLPT', 'By JLPT') : t('Série escolar', 'School grade')}</h2>
          <p>{t('Escolha os kanjis que vão aparecer no treino.', 'Choose the kanji to include in practice.')}</p>
        {loading && <p className="trainer-message">{t('Carregando os kanjis…', 'Loading kanji…')}</p>}
        {loadError && <p className="trainer-error" role="alert">{t('Não foi possível carregar o banco de kanjis.', 'Could not load the kanji database.')}</p>}

        {!loading && !loadError && (
          <>
            <div className={'kanji-art-grid kanji-art-grid--' + grouping + ' ' + styles.levels} role="group" aria-label={t('Conjuntos de kanjis', 'Kanji sets')}>
              {levels.map((level) => {
                const count = data.filter((item) => {
                  const belongsToLevel = grouping === 'jlpt'
                    ? item.jlpt === level
                    : item.grade === Number(level);
                  return belongsToLevel && item.fullWords.length > 0;
                }).length;
                const label = grouping === 'jlpt' ? level : t(`${level}º ano`, `Grade ${level}`);

                return (
                  <div className={styles.level} key={level}>
                  <button
                    className="kanji-art-card"
                    aria-pressed={selectedLevel === level}
                    aria-label={t(label + ', ' + count + ' kanjis', label + ', ' + count + ' kanji')}
                    type="button"
                    key={level}
                    onClick={() => chooseLevel(level)}
                  >
                    <ThemeArt src={'/kanji-assets/' + (grouping === 'jlpt' ? 'jlpt' : 'grade') + '-' + level + '.webp'} darkSrc={'/kanji-assets/' + (grouping === 'jlpt' ? 'jlpt' : 'grade') + '-' + level + '-dark.webp'} alt="" />
                    {selectedLevel === level && <span className="kanji-selection-check" aria-hidden="true">✓</span>}
                  </button>
                  <span className={styles.count}>{t(count + ' kanjis', count + ' kanji')}</span>
                  </div>
                );
              })}
            </div>

            {selectedLevel && (
              <div className="kanji-selection-actions">
                <button className="kanji-begin" type="button" onClick={startSession}>
                  {t(`Jogar com ${advanced ? selectedIds.size : levelKanji.length} kanjis`, `Play with ${advanced ? selectedIds.size : levelKanji.length} kanji`)}
                </button>
                <button
                  className="kanji-customize" aria-expanded={advanced}
                  type="button"
                  onClick={() => setAdvanced((value) => !value)}
                >
                  {advanced ? t('Fechar seleção avançada', 'Close custom selection') : t('Avançado: escolher kanjis', 'Custom selection: choose kanji')}
                </button>
              </div>
            )}

            {advanced && selectedLevel && (
              <section className="advanced-picker" aria-labelledby="word-advanced-title">
                <div className="advanced-heading">
                  <div>
                    <h2 id="word-advanced-title">{t('Seleção avançada', 'Custom selection')}</h2>
                    <p>{t(`${selectedIds.size} de ${levelKanji.length} selecionados`, `${selectedIds.size} of ${levelKanji.length} selected`)}</p>
                  </div>
                  <input
                    type="search"
                    placeholder={t('Buscar kanji ou significado', 'Search kanji or meaning')}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>

                <div className="advanced-tools">
                  <button type="button" onClick={() => setSelectedIds(new Set(levelKanji.map((item) => item.id)))}>
                    {t('Selecionar todos', 'Select all')}
                  </button>
                  <button type="button" onClick={() => setSelectedIds(new Set())}>{t('Limpar', 'Clear')}</button>
                </div>

                <div className="kanji-picker-grid" role="group" aria-label={t('Selecionar kanjis do conjunto', 'Choose kanji from this set')}>
                    {visibleAdvancedKanji.map((item) => (
                      <KanjiPickerCard key={item.id} item={item} checked={selectedIds.has(item.id)} onChange={() => toggleKanji(item.id)} />
                    ))}
                    {visibleAdvancedKanji.length === 0 && <p className="kanji-picker-empty" role="status">{t('Nenhum kanji encontrado.', 'No kanji found.')}</p>}
                  </div>
              </section>
            )}
          </>
        )}

        {sessionError && <p className="trainer-error" role="alert">{t(sessionError.pt, sessionError.en)}</p>}
      </section>
      </div>
    </main>
  );
}
