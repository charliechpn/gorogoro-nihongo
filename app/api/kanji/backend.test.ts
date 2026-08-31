import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateAnsweredProgress,
  drawWeightedCandidate,
  normalizeImportedProgress,
  resolveLearnerId,
  sanitizeSelectedIds,
  validateGroupingAndLevel,
} from './logic.ts';

test('a identidade autenticada sempre vence o identificador anônimo', () => {
  const headers = new Headers({
    'oai-authenticated-user-id': 'user-123',
    'x-nihongo-learner-id': '4d4c9bb0-021c-4fb7-9181-dab2f046c947',
  });
  assert.equal(resolveLearnerId(headers), 'oai:user-123');
});

test('o sorteio ponderado trata cada cópia como um bilhete real', () => {
  const candidates = [
    { id: 1, copies: 1, lastResult: null, streak: 0 },
    { id: 2, copies: 3, lastResult: null, streak: 0 },
  ];
  assert.equal(drawWeightedCandidate(candidates, () => 0).id, 1);
  assert.equal(drawWeightedCandidate(candidates, () => 0.2499).id, 1);
  assert.equal(drawWeightedCandidate(candidates, () => 0.25).id, 2);
  assert.equal(drawWeightedCandidate(candidates, () => 0.999).id, 2);
});

test('a resposta do backend usa a mesma regra de streak do baralho', () => {
  const once = calculateAnsweredProgress({ copies: 3, lastResult: null, streak: 0 }, 'correct');
  const twice = calculateAnsweredProgress(once, 'correct');
  assert.deepEqual(twice, { copies: 2, lastResult: 'correct', streak: 0 });
});

test('níveis e seleção avançada são validados sem deixar lixo entrar', () => {
  assert.deepEqual(validateGroupingAndLevel('jlpt', 'N3'), { grouping: 'jlpt', level: 'N3' });
  assert.deepEqual(sanitizeSelectedIds([1, 1, 2, -4, 9999, 3.5]), [1, 2]);
  assert.throws(() => validateGroupingAndLevel('grade', 'N5'));
});

test('o progresso legado é normalizado antes de entrar no servidor', () => {
  assert.deepEqual(normalizeImportedProgress({
    1: { copies: 4, lastResult: 'wrong', streak: 1 },
    2: { copies: 99, lastResult: 'correct', streak: 1 },
    nope: { copies: 3 },
  }), [{ kanjiId: 1, copies: 4, lastResult: 'wrong', streak: 1 }]);
});
