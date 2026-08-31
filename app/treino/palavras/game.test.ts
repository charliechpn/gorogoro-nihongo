import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAcceptedWordMap,
  gradeAnswers,
  shuffleIds,
  tokenizeAnswers,
} from './game.ts';

test('aceita vírgulas japonesas, vírgulas comuns e quebras de linha', () => {
  assert.deepEqual(
    tokenizeAnswers('生きる、人生, 生まれる\n生活').words,
    ['生きる', '人生', '生まれる', '生活'],
  );
});

test('normaliza largura Unicode e ignora respostas repetidas', () => {
  const parsed = tokenizeAnswers('人生，人生; 人生');
  assert.deepEqual(parsed.words, ['人生']);
  assert.equal(parsed.duplicateCount, 2);
});

test('mesma grafia com leituras diferentes continua sendo uma resposta', () => {
  const accepted = buildAcceptedWordMap([
    '翌朝（よくあさ）',
    '翌朝（よくちょう）',
  ]);

  assert.deepEqual(accepted.get('翌朝'), [
    '翌朝（よくあさ）',
    '翌朝（よくちょう）',
  ]);
});

test('só conta palavras da base que exibem o kanji pedido', () => {
  const result = gradeAnswers(
    '生',
    '生きる、人生、せいかつ、生命体',
    ['生きる（いきる）', '人生（じんせい）', '生活（せいかつ）'],
  );

  assert.equal(result.correctCount, 2);
  assert.equal(result.notRecognizedCount, 1);
  assert.equal(result.missingKanjiCount, 1);
  assert.deepEqual(
    result.answers.map((answer) => answer.status),
    ['correct', 'correct', 'missing-kanji', 'not-in-base'],
  );
});

test('embaralha sem repetir nem alterar a lista original', () => {
  const ids = [1, 2, 3, 4];
  const shuffled = shuffleIds(ids, () => 0);

  assert.deepEqual(ids, [1, 2, 3, 4]);
  assert.deepEqual([...shuffled].sort(), ids);
  assert.equal(new Set(shuffled).size, ids.length);
});
