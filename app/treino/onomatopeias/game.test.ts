import assert from 'node:assert/strict';
import test from 'node:test';
import { createMeaningChoices, type OnomatopoeiaEntry } from './game.ts';

const entries: OnomatopoeiaEntry[] = [
  { id: 1, term: 'ドキドキ', meaningPt: 'Coração acelerado.', meaningJa: '胸が高鳴る様子。', categories: ['gijougo'] },
  { id: 2, term: 'ワンワン', meaningPt: 'Latido de cachorro.', meaningJa: '犬がほえる声。', categories: ['giseigo'] },
  { id: 3, term: 'ザーザー', meaningPt: 'Som de chuva forte.', meaningJa: '雨が激しく降る音。', categories: ['giongo'] },
  { id: 4, term: 'キラキラ', meaningPt: 'Brilho cintilante.', meaningJa: '光が輝く様子。', categories: ['gitaigo'] },
];

test('o modo fácil cria uma opção correta e dois distratores do banco completo', () => {
  const choices = createMeaningChoices(entries, 1, () => 0.42);

  assert.equal(choices.length, 3);
  assert.equal(choices.filter((choice) => choice.isCorrect).length, 1);
  assert.equal(choices.find((choice) => choice.isCorrect)?.id, 1);
  assert.equal(new Set(choices.map((choice) => choice.id)).size, 3);
  assert.equal(new Set(choices.map((choice) => choice.text)).size, 3);
});

test('o kanji atual nunca entra como próprio distrator', () => {
  const choices = createMeaningChoices(entries, 3, () => 0);

  assert.equal(choices.filter((choice) => choice.id === 3).length, 1);
  assert.equal(choices.find((choice) => choice.id === 3)?.isCorrect, true);
});

test('o modo fácil exige três definições diferentes', () => {
  assert.throws(
    () => createMeaningChoices(entries.slice(0, 2), 1, () => 0),
    /pelo menos três definições diferentes/,
  );
});
