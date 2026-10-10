import type { KanjiGrouping } from './contracts';

export const SAVED_KANJI_LISTS_KEY = 'gorogoro-kanji-lists-v1';

export type SavedKanjiList = {
  id: string;
  name: string;
  grouping: KanjiGrouping;
  level: string;
  kanjiIds: number[];
  updatedAt: number;
};

function isSavedList(value: unknown): value is SavedKanjiList {
  if (!value || typeof value !== 'object') return false;
  const list = value as Record<string, unknown>;
  const validLevel = list.grouping === 'grade'
    ? typeof list.level === 'string' && /^[1-6]$/.test(list.level)
    : list.grouping === 'jlpt' && typeof list.level === 'string' && /^N[1-5]$/.test(list.level);

  return typeof list.id === 'string' && list.id.length > 0
    && typeof list.name === 'string' && list.name.trim().length > 0
    && validLevel
    && Array.isArray(list.kanjiIds)
    && list.kanjiIds.every((id: unknown) => Number.isSafeInteger(id) && (id as number) > 0)
    && typeof list.updatedAt === 'number' && Number.isFinite(list.updatedAt);
}

export function readSavedKanjiLists(storage: Pick<Storage, 'getItem'>): SavedKanjiList[] {
  try {
    const raw = storage.getItem(SAVED_KANJI_LISTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.filter((item): item is SavedKanjiList => {
      if (!isSavedList(item) || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  } catch {
    return [];
  }
}

export function writeSavedKanjiLists(storage: Pick<Storage, 'setItem'>, lists: SavedKanjiList[]) {
  storage.setItem(SAVED_KANJI_LISTS_KEY, JSON.stringify(lists));
}
