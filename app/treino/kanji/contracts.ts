import type { AnswerResult, PersistedKanjiProgress } from './deck';

export type KanjiRecord = {
  id: number;
  kanji: string;
  meaning: string;
  meaningEn: string | null;
  onyomi: string | null;
  kunyomi: string | null;
  grade: number;
  jlpt: string | null;
};

export type KanjiCatalogResponse = {
  version: number;
  count: number;
  kanji: KanjiRecord[];
};

export type KanjiGrouping = 'jlpt' | 'grade';

export type KanjiSessionView = {
  sessionId: string;
  grouping: KanjiGrouping;
  level: string;
  selectedCount: number;
  turn: number;
  currentId: number;
  progress: PersistedKanjiProgress;
};

export type StartKanjiSessionInput = {
  grouping: KanjiGrouping;
  level: string;
  selectedIds?: number[];
};

export type AnswerKanjiSessionInput = {
  sessionId: string;
  turn: number;
  kanjiId: number;
  result: AnswerResult;
};
