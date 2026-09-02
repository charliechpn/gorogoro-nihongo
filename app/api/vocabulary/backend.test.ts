import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateVocabularyAnswer,
  validateVocabularyConfiguration,
} from './logic.ts';

test('configura os dois sentidos e ignora furigana em português para japonês', () => {
  assert.deepEqual(
    validateVocabularyConfiguration('N5', 'jp_to_pt', true),
    { level: 'N5', direction: 'jp_to_pt', showFurigana: true },
  );
  assert.deepEqual(
    validateVocabularyConfiguration('N1', 'pt_to_jp', true),
    { level: 'N1', direction: 'pt_to_jp', showFurigana: false },
  );
});

test('rejeita nível, direção, furigana e resposta adulterados', () => {
  assert.throws(() => validateVocabularyConfiguration('N0', 'jp_to_pt', true));
  assert.throws(() => validateVocabularyConfiguration('N5', 'jp_to_fr', true));
  assert.throws(() => validateVocabularyConfiguration('N5', 'jp_to_pt', 'sim'));
  assert.throws(() => validateVocabularyAnswer(0, 1, 'correct'));
  assert.throws(() => validateVocabularyAnswer(1, -4, 'correct'));
  assert.throws(() => validateVocabularyAnswer(1, 4, 'talvez'));
});

test('normaliza uma resposta válida sem alterar o julgamento do usuário', () => {
  assert.deepEqual(
    validateVocabularyAnswer(12, 81, 'wrong'),
    { turn: 12, vocabularyId: 81, result: 'wrong' },
  );
});

