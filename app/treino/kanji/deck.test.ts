import assert from 'node:assert/strict';
import test from 'node:test';
import {
  answerKanji,
  applyAnswer,
  buildAvailableCopyPool,
  createDeckSession,
  drawNextKanji,
  type PersistedKanjiProgress,
} from './deck.ts';

test('cada kanji começa com 3 cópias', () => {
  const session = createDeckSession([1, 2, 3]);

  assert.deepEqual(
    Object.values(session.entries).map((entry) => entry.copies),
    [3, 3, 3],
  );
});

test('duas respostas iguais alteram uma cópia e zeram a streak', () => {
  let progress: PersistedKanjiProgress = { copies: 3, lastResult: null, streak: 0 };

  progress = applyAnswer(progress, 'correct');
  assert.deepEqual(progress, { copies: 3, lastResult: 'correct', streak: 1 });

  progress = applyAnswer(progress, 'correct');
  assert.deepEqual(progress, { copies: 2, lastResult: 'correct', streak: 0 });

  progress = applyAnswer(progress, 'wrong');
  progress = applyAnswer(progress, 'wrong');
  assert.deepEqual(progress, { copies: 3, lastResult: 'wrong', streak: 0 });
});

test('trocar o resultado reinicia a streak', () => {
  let progress: PersistedKanjiProgress = { copies: 3, lastResult: null, streak: 0 };

  progress = applyAnswer(progress, 'correct');
  progress = applyAnswer(progress, 'wrong');

  assert.deepEqual(progress, { copies: 3, lastResult: 'wrong', streak: 1 });
});

test('cópias permanecem entre 1 e 8', () => {
  let mastered: PersistedKanjiProgress = { copies: 1, lastResult: 'correct', streak: 1 };
  let struggling: PersistedKanjiProgress = { copies: 8, lastResult: 'wrong', streak: 1 };

  mastered = applyAnswer(mastered, 'correct');
  struggling = applyAnswer(struggling, 'wrong');

  assert.equal(mastered.copies, 1);
  assert.equal(struggling.copies, 8);
});

test('o sorteio usa uma entrada para cada cópia disponível', () => {
  const session = createDeckSession([1, 2, 3], {
    1: { copies: 1, lastResult: null, streak: 0 },
    2: { copies: 4, lastResult: null, streak: 0 },
    3: { copies: 2, lastResult: null, streak: 0 },
  });

  assert.deepEqual(buildAvailableCopyPool(session), [1, 2, 2, 2, 2, 3, 3]);
});

test('um kanji sorteado bloqueia todas as suas cópias por dois turnos', () => {
  let session = createDeckSession([1, 2, 3]);

  const first = drawNextKanji(session, () => 0);
  assert.equal(first.kanjiId, 1);
  session = first.session;

  const secondPool = buildAvailableCopyPool(session);
  assert.equal(secondPool.includes(1), false);
  const second = drawNextKanji(session, () => 0);
  assert.equal(second.kanjiId, 2);
  session = second.session;

  const thirdPool = buildAvailableCopyPool(session);
  assert.equal(thirdPool.includes(1), false);
  const third = drawNextKanji(session, () => 0);
  assert.equal(third.kanjiId, 3);
  session = third.session;

  const fourthPool = buildAvailableCopyPool(session);
  assert.equal(fourthPool.includes(1), true);
  assert.equal(drawNextKanji(session, () => 0).kanjiId, 1);
});

test('a resposta altera as cópias mesmo durante o bloqueio', () => {
  let session = createDeckSession([1, 2, 3]);
  session = drawNextKanji(session, () => 0).session;
  session = answerKanji(session, 1, 'wrong');
  session = answerKanji(session, 1, 'wrong');

  assert.equal(session.entries[1].copies, 4);
  assert.equal(session.entries[1].blockedUntilTurn, 3);
});
