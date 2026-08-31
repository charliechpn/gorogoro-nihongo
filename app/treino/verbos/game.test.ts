import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isCorrectClassification,
  verbsForLevel,
  type TransitivityVerb,
} from './game.ts';

const verbs: TransitivityVerb[] = [
  {
    id: 1,
    word: '開ける',
    reading: 'あける',
    display: '開ける（あける）',
    jlptLevel: 'N5',
    classification: 'transitive',
    meaningPt: 'abrir',
    meaningJa: 'を開く',
    explanationPt: 'A ação recai sobre um objeto.',
    explanationJa: '他動詞です。',
    examples: [{ role: 'transitive', ja: '窓を開ける。', pt: 'Abrir a janela.' }],
  },
  {
    id: 2,
    word: '開く',
    reading: 'あく',
    display: '開く（あく）',
    jlptLevel: 'N5',
    classification: 'intransitive',
    meaningPt: 'abrir; ficar aberto',
    meaningJa: '開いた状態になる',
    explanationPt: 'Não possui objeto direto.',
    explanationJa: '自動詞です。',
    examples: [{ role: 'intransitive', ja: 'ドアが開く。', pt: 'A porta abre.' }],
  },
  {
    id: 3,
    word: '吹く',
    reading: 'ふく',
    display: '吹く（ふく）',
    jlptLevel: 'N5',
    classification: 'depends',
    meaningPt: 'soprar',
    meaningJa: '吹く',
    explanationPt: 'Depende do sentido.',
    explanationJa: '意味によります。',
    examples: [
      { role: 'transitive', ja: 'シャボン玉を吹く。', pt: 'Soprar bolhas.' },
      { role: 'intransitive', ja: '風が吹く。', pt: 'O vento sopra.' },
    ],
  },
];

test('cada resposta só acerta sua classificação exata', () => {
  assert.equal(isCorrectClassification(verbs[0], 'transitive'), true);
  assert.equal(isCorrectClassification(verbs[0], 'intransitive'), false);
  assert.equal(isCorrectClassification(verbs[2], 'depends'), true);
});

test('a divisão por JLPT não mistura níveis', () => {
  const n4Verb = { ...verbs[0], id: 4, jlptLevel: 'N4' as const };
  assert.deepEqual(verbsForLevel([...verbs, n4Verb], 'N4').map((verb) => verb.id), [4]);
  assert.deepEqual(verbsForLevel([...verbs, n4Verb], 'N5').map((verb) => verb.id), [1, 2, 3]);
});
