import type { AnswerResult, PersistedKanjiProgress } from '../kanji/deck';

export type VocabularyDirection = 'pt_to_jp' | 'jp_to_pt';

export type VocabularyRecord = {
  id: number;
  word: string;
  reading: string;
  meaningsPt: string[];
  jlpt: string;
};

export type VocabularyCatalogResponse = {
  version: number;
  total: number;
  counts: Record<string, number>;
};

export type VocabularySessionView = {
  sessionId: string;
  level: string;
  direction: VocabularyDirection;
  showFurigana: boolean;
  selectedCount: number;
  turn: number;
  current: VocabularyRecord;
  progress: PersistedKanjiProgress;
};

export type StartVocabularySessionInput = {
  level: string;
  direction: VocabularyDirection;
  showFurigana: boolean;
};

export type AnswerVocabularySessionInput = {
  sessionId: string;
  turn: number;
  vocabularyId: number;
  result: AnswerResult;
};

