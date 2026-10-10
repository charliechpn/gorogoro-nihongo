'use client';

import KanjiPickerCard from '../kanji-picker-card';
import TrainingFlow from '../training-flow';
import SiteHeader from '@/app/site-header';
import ThemeArt from '@/app/theme-art';
import { useLanguage, useText } from '@/app/language';


import { useEffect, useMemo, useRef, useState } from 'react';
import PracticeSession from './practice-session';
import type { PersistedKanjiProgress } from './deck';
import {
  closeKanjiSession,
  createKanjiSession,
  fetchKanjiCatalog,
  importLegacyProgress,
  submitKanjiAnswer,
  type AnswerResult,
} from './api';
import type { KanjiGrouping as Grouping, KanjiRecord, KanjiSessionView } from './contracts';
import { readSavedKanjiLists, SAVED_KANJI_LISTS_KEY, writeSavedKanjiLists, type SavedKanjiList } from './saved-lists';

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
  const t = useText();
  const language = useLanguage();
  const [data, setData] = useState<KanjiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [grouping, setGrouping] = useState<Grouping>('grade');
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [savedLists, setSavedLists] = useState<SavedKanjiList[]>([]);
  const [listName, setListName] = useState('');
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [listMessage, setListMessage] = useState<{ pt: string; en: string; error?: boolean } | null>(null);
  const [session, setSession] = useState<KanjiSessionView | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [sessionError, setSessionError] = useState<{ pt: string; en: string } | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const activeSessionId = useRef<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        setSavedLists(readSavedKanjiLists(window.localStorage));
        window.localStorage.removeItem(SESSION_KEY);
      } catch { /* Storage may be unavailable. */ }
      try {
        const payload = await fetchKanjiCatalog();
        if (cancelled) return;
        setData(payload.kanji);
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
      if (activeSessionId.current) void closeKanjiSession(activeSessionId.current).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    function syncLists(event: StorageEvent) {
      if (event.key === SAVED_KANJI_LISTS_KEY || event.key === null) {
        try { setSavedLists(readSavedKanjiLists(window.localStorage)); } catch { setSavedLists([]); }
      }
    }
    window.addEventListener('storage', syncLists);
    return () => window.removeEventListener('storage', syncLists);
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
    setEditingListId(null);
    setListName('');
    setListMessage(null);
    setSessionError(null);
  }

  function changeGrouping(nextGrouping: Grouping) {
    setGrouping(nextGrouping);
    setSelectedLevel(null);
    setSelectedIds(new Set());
    setAdvanced(false);
    setSearch('');
    setEditingListId(null);
    setListName('');
    setListMessage(null);
    setSessionError(null);
  }

  function openSavedList(list: SavedKanjiList) {
    const availableIds = new Set(data
      .filter((item) => list.grouping === 'jlpt' ? item.jlpt === list.level : item.grade === Number(list.level))
      .map((item) => item.id));
    setGrouping(list.grouping);
    setSelectedLevel(list.level);
    setSelectedIds(new Set(list.kanjiIds.filter((id) => availableIds.has(id))));
    setAdvanced(true);
    setEditingListId(list.id);
    setListName(list.name);
    setSearch('');
    setListMessage(null);
    setSessionError(null);
  }

  function saveList() {
    const name = listName.trim();
    if (!name) {
      setListMessage({ pt: 'Dê um nome à lista.', en: 'Give this list a name.', error: true });
      return;
    }
    if (selectedIds.size < 3) {
      setListMessage({ pt: 'Selecione pelo menos 3 kanjis.', en: 'Select at least 3 kanji.', error: true });
      return;
    }
    if (!selectedLevel) return;

    const id = editingListId ?? window.crypto.randomUUID();
    const saved: SavedKanjiList = {
      id, name, grouping, level: selectedLevel, kanjiIds: [...selectedIds].sort((a, b) => a - b), updatedAt: Date.now(),
    };
    try {
      const next = [saved, ...readSavedKanjiLists(window.localStorage).filter((list) => list.id !== id)];
      writeSavedKanjiLists(window.localStorage, next);
      setSavedLists(next);
      setEditingListId(id);
      setListMessage({ pt: 'Lista salva neste navegador.', en: 'List saved in this browser.' });
    } catch {
      setListMessage({ pt: 'O navegador não conseguiu salvar a lista.', en: 'Your browser could not save this list.', error: true });
    }
  }

  function deleteList(list: SavedKanjiList) {
    if (!window.confirm(t(`Excluir a lista “${list.name}”?`, `Delete the list “${list.name}”?`))) return;
    try {
      const next = readSavedKanjiLists(window.localStorage).filter((item) => item.id !== list.id);
      writeSavedKanjiLists(window.localStorage, next);
      setSavedLists(next);
      if (editingListId === list.id) {
        setEditingListId(null);
        setListName('');
      }
      setListMessage({ pt: 'Lista excluída.', en: 'List deleted.' });
    } catch {
      setListMessage({ pt: 'Não foi possível excluir a lista.', en: 'Could not delete this list.', error: true });
    }
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
      setSessionError({ pt: 'Selecione pelo menos 3 kanjis para manter o bloqueio de dois turnos.', en: 'Select at least 3 kanji so recent cards can stay out of the next two turns.' });
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
      if (!mounted.current) {
        void closeKanjiSession(created.sessionId).catch(() => undefined);
        return;
      }
      activeSessionId.current = created.sessionId;
      setSession(created);
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
      const updated = await submitKanjiAnswer({
        sessionId: session.sessionId,
        turn: session.turn,
        kanjiId: session.currentId,
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
    if (sessionId) void closeKanjiSession(sessionId).catch(() => undefined);
  }

  if (session && currentKanji && currentEntry) {
    return <PracticeSession
      session={session}
      kanji={currentKanji}
      revealed={revealed}
      busy={sessionBusy}
      error={sessionError ? t(sessionError.pt, sessionError.en) : ''}
      onReveal={() => setRevealed(true)}
      onAnswer={answer}
      onLeave={leaveSession}
    />;
  }

  const levels = grouping === 'jlpt' ? JLPT_LEVELS : SCHOOL_GRADES;

  return (
    <main className="kanji-selection-page">
      <ThemeArt className="kanji-corner-tree" src="/kanji-assets/tree.webp" darkSrc="/kanji-assets/tree-dark.webp" alt="" aria-hidden="true" />
      <SiteHeader homeLink /><TrainingFlow step={session ? session.turn : 'selection'} revealed={revealed} />
      <div className="kanji-selection-content">
        <section className="kanji-selection-hero" aria-labelledby="kanji-title">
          <div className="kanji-selection-copy">
            <p className="eyebrow">{t('ESTUDE JAPONÊS. USE O QUE APRENDE.', 'STUDY JAPANESE. PUT IT TO USE.')}</p>
            <h1 id="kanji-title">{t('Treino de kanji', 'Kanji practice')}</h1>
            <p className="kanji-selection-description">{t('Escolha um grupo e pratique no seu ritmo.', 'Choose a group and practice at your own pace.')}<br />{t('Pequenos passos, grandes conquistas.', 'Small steps add up.')}</p>
            <div className="kanji-group-switch" role="group" aria-label={t('Organizar kanjis', 'Group kanji')}>
              <button type="button" aria-pressed={grouping === 'jlpt'} onClick={() => changeGrouping('jlpt')}>{t('Por JLPT', 'By JLPT')}</button>
              <button type="button" aria-pressed={grouping === 'grade'} onClick={() => changeGrouping('grade')}>{t('Série escolar', 'School grade')}</button>
            </div>
          </div>
        </section>
        <section className="kanji-level-selection" aria-labelledby="kanji-group-title">
          <h2 id="kanji-group-title">{grouping === 'grade' ? t('Série escolar', 'School grade') : t('Por JLPT', 'By JLPT')}</h2>
          <p>{grouping === 'grade' ? t('Escolha o ano escolar e pratique os kanjis ensinados nessa fase.', 'Choose a school grade to practice the kanji taught at that level.') : t('Escolha o nível e pratique os kanjis organizados por exame.', 'Choose a JLPT level to practice its kanji.')}</p>
          <div className={'kanji-art-grid kanji-art-grid--' + grouping} role="group" aria-label={grouping === 'grade' ? t('Ano escolar', 'School grade') : t('Nível JLPT', 'JLPT level')}>
            {levels.map((level) => {
              const label = grouping === 'grade' ? t(level + 'º ano', 'Grade ' + level) : level;
              const count = data.filter(item => grouping === 'grade' ? item.grade === Number(level) : item.jlpt === level).length;
              return (
                <div className="kanji-level-with-count" key={grouping + level}>
                <button className="kanji-art-card" type="button" aria-pressed={selectedLevel === level} aria-label={!loading && !loadError ? t(label + ', ' + count + ' kanjis', label + ', ' + count + ' kanji') : label} onClick={() => chooseLevel(level)}>
                  <ThemeArt src={'/kanji-assets/' + (grouping === 'grade' ? 'grade' : 'jlpt') + '-' + level + '.webp'} darkSrc={'/kanji-assets/' + (grouping === 'grade' ? 'grade' : 'jlpt') + '-' + level + '-dark.webp'} alt="" />
                  {selectedLevel === level && <span className="kanji-selection-check" aria-hidden="true">✓</span>}
                </button>
                <span className="kanji-level-count">{!loading && !loadError ? t(count + ' kanjis', count + ' kanji') : "\u00a0"}</span>
                </div>
              );
            })}
          </div>
          {loading && <p className="kanji-selection-status" role="status">{t('Carregando os kanjis…', 'Loading kanji…')}</p>}
          {loadError && <p className="trainer-error" role="alert">{t('Não foi possível carregar o banco de kanjis.', 'Could not load the kanji database.')}</p>}
          {savedLists.length > 0 && <section className="saved-kanji-lists" aria-labelledby="saved-kanji-lists-title">
            <h3 id="saved-kanji-lists-title">{t('Minhas listas', 'My lists')}</h3>
            <p>{t('Salvas neste navegador.', 'Saved in this browser.')}</p>
            <ul>
              {savedLists.map((list) => <li key={list.id}>
                <button type="button" className="saved-kanji-open" disabled={loading || !!loadError} onClick={() => openSavedList(list)}>
                  <strong>{list.name}</strong>
                  <span>{list.grouping === 'grade' ? t(`${list.level}º ano`, `Grade ${list.level}`) : list.level} · {t(`${list.kanjiIds.length} kanjis`, `${list.kanjiIds.length} kanji`)}</span>
                </button>
                <button type="button" className="saved-kanji-delete" aria-label={t(`Excluir ${list.name}`, `Delete ${list.name}`)} onClick={() => deleteList(list)}>{t('Excluir', 'Delete')}</button>
              </li>)}
            </ul>
          </section>}
          <div className="kanji-selection-actions">
            <button className="kanji-begin" type="button" disabled={!selectedLevel || loading || !!loadError || sessionBusy} onClick={startTraining}>
              {sessionBusy ? t('Abrindo sessão…', 'Starting session…') : t('Começar treino', 'Start practice')} <span aria-hidden="true">→</span>
            </button>
            {selectedLevel && !loading && !loadError && <button className="kanji-customize" type="button" aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}>{advanced ? t('Fechar seleção avançada', 'Close custom selection') : t('Escolher kanjis do conjunto', 'Choose individual kanji')}</button>}
          </div>
              {advanced && selectedLevel && (
                <section className="advanced-picker" aria-labelledby="advanced-title">
                  <div className="advanced-heading">
                    <div>
                      <h2 id="advanced-title">{t('Seleção avançada', 'Custom selection')}</h2>
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

                  <div className="saved-kanji-editor">
                    <label htmlFor="kanji-list-name">{t('Nome da lista', 'List name')}</label>
                    <div>
                      <input id="kanji-list-name" type="text" maxLength={60} value={listName} onChange={(event) => { setListName(event.target.value); setListMessage(null); }} placeholder={t('Ex.: kanjis para revisar', 'E.g. kanji to review')} />
                      <button type="button" onClick={saveList}>{editingListId ? t('Salvar alterações', 'Save changes') : t('Salvar lista', 'Save list')}</button>
                    </div>
                    <p>{t('A lista fica neste navegador. Limpar os dados do site também apaga suas listas.', 'This list stays in this browser. Clearing site data also deletes your lists.')}</p>
                    {listMessage && <p role={listMessage.error ? 'alert' : 'status'} className={listMessage.error ? 'trainer-error' : ''}>{t(listMessage.pt, listMessage.en)}</p>}
                  </div>

                  <div className="kanji-picker-grid" role="group" aria-label={t('Selecionar kanjis do conjunto', 'Choose kanji from this set')}>
                    {visibleAdvancedKanji.map((item) => (
                      <KanjiPickerCard key={item.id} item={item} checked={selectedIds.has(item.id)} onChange={() => toggleKanji(item.id)} />
                    ))}
                    {visibleAdvancedKanji.length === 0 && <p className="kanji-picker-empty" role="status">{t('Nenhum kanji encontrado.', 'No kanji found.')}</p>}
                  </div>
                </section>
              )}
          {!advanced && listMessage && <p role={listMessage.error ? 'alert' : 'status'} className={listMessage.error ? 'trainer-error' : 'kanji-selection-status'}>{t(listMessage.pt, listMessage.en)}</p>}
          {sessionError && <p className="trainer-error" role="alert">{t(sessionError.pt, sessionError.en)}</p>}
        </section>
      </div>
    </main>
  );
}
