import assert from 'node:assert/strict';
import test from 'node:test';
import { readSavedKanjiLists, SAVED_KANJI_LISTS_KEY, writeSavedKanjiLists, type SavedKanjiList } from './saved-lists.ts';

const list: SavedKanjiList = {
  id: 'list-1', name: 'Revisão', grouping: 'grade', level: '2', kanjiIds: [82, 83, 84], updatedAt: 123,
};

test('saved kanji lists survive a browser storage round trip', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  writeSavedKanjiLists(storage, [list]);
  assert.deepEqual(readSavedKanjiLists(storage), [list]);
});

test('corrupt storage and invalid lists do not break the picker', () => {
  const storage = { getItem: () => '{broken json' };
  assert.deepEqual(readSavedKanjiLists(storage), []);

  const mixed = { getItem: (key: string) => key === SAVED_KANJI_LISTS_KEY
    ? JSON.stringify([list, { ...list, id: 'bad-level', level: '9' }, { ...list, id: 'bad-ids', kanjiIds: [82, '83'] }, { ...list }])
    : null };
  assert.deepEqual(readSavedKanjiLists(mixed), [list]);
});
