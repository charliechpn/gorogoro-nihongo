import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

type CuratedEntry = [
  id: number,
  word: string,
  reading: string,
  promptPt: string,
  meaningsPt: string[],
];

const n5Curation = JSON.parse(
  fs.readFileSync('content/vocabulary/n5.pt.json', 'utf8'),
) as { level: string; entries: CuratedEntry[] };
const n4Curation = JSON.parse(
  fs.readFileSync('content/vocabulary/n4.pt.json', 'utf8'),
) as { level: string; entries: CuratedEntry[] };

const n5ById = new Map(n5Curation.entries.map((entry) => [entry[0], entry]));
const n4ById = new Map(n4Curation.entries.map((entry) => [entry[0], entry]));

function assertCurationIntegrity(
  curation: { level: string; entries: CuratedEntry[] },
  firstId: number,
  expectedCount: number,
) {
  assert.equal(curation.entries.length, expectedCount);
  assert.equal(new Set(curation.entries.map(([id]) => id)).size, expectedCount);
  assert.deepEqual(
    curation.entries.map(([id]) => id),
    Array.from({ length: expectedCount }, (_, index) => firstId + index),
  );

  const prompts = curation.entries.map(([, , , prompt]) => prompt.toLocaleLowerCase('pt-BR'));
  const headwords = curation.entries.map(([, word, reading]) => `${word}\u0000${reading}`);
  assert.equal(new Set(prompts).size, prompts.length);
  assert.equal(new Set(headwords).size, headwords.length);

  for (const [id, word, , prompt, meanings] of curation.entries) {
    assert.ok(prompt.trim(), `pista vazia no id ${id}: ${word}`);
    assert.ok(meanings.length > 0, `significados vazios no id ${id}: ${word}`);
    assert.equal(new Set(meanings.map((meaning) => meaning.toLocaleLowerCase('pt-BR').trim())).size, meanings.length);
    assert.doesNotMatch(`${prompt} ${meanings.join(' ')}`, /\b(to |the |half minute|fouth|luke warm|forma honorífica:)\b/i);
  }
}

test('a curadoria cobre exatamente as 459 entradas N5', () => {
  assert.equal(n5Curation.level, 'N5');
  assertCurationIntegrity(n5Curation, 1, 459);
});

test('a curadoria cobre exatamente as 432 entradas N4', () => {
  assert.equal(n4Curation.level, 'N4');
  assertCurationIntegrity(n4Curation, 460, 432);
});

test('as curadorias N5 e N4 não repetem palavra/leitura entre níveis', () => {
  const entries = [...n5Curation.entries, ...n4Curation.entries];
  const headwords = entries.map(([, word, reading]) => `${word}\u0000${reading}`);
  assert.equal(new Set(headwords).size, headwords.length);
});

test('casos semanticamente perigosos foram curados explicitamente', () => {
  assert.deepEqual(n5ById.get(4), [4, 'お皿', 'おさら', 'prato; louça', ['prato', 'louça']]);
  assert.equal(n5ById.get(68)?.[3], 'abrir-se; ficar aberto');
  assert.equal(n5ById.get(69)?.[3], 'abrir alguma coisa');
  assert.equal(n5ById.get(140)?.[3], 'grosso; espesso (objetos planos ou camadas)');
  assert.equal(n5ById.get(241)?.[3], 'levantar; elevar; aumentar');
  assert.equal(n5ById.get(289)?.[3], 'grosso (grande diâmetro)');
  assert.equal(n5ById.get(365)?.[1], 'お祖父さん');
  assert.deepEqual(n5ById.get(375)?.[4], ['metade', 'meia porção', 'cinquenta por cento']);
  assert.equal(n5ById.get(419)?.[1], '明るい');

  assert.equal(n4ById.get(647)?.[3], 'jogar fora; descartar');
  assert.equal(n4ById.get(787)?.[3], 'arremessar; lançar');
  assert.notEqual(n4ById.get(647)?.[3], n4ById.get(787)?.[3]);
  assert.equal(n4ById.get(657)?.[3], 'recepção; balcão de atendimento');
  assert.equal(n4ById.get(519)?.[1], '楽しむ');
  assert.equal(n4ById.get(568)?.[1], '決まる');
  assert.equal(n4ById.get(663)?.[1], '集まる');
  assert.equal(n4ById.get(683)?.[1], '上がる');
  assert.equal(n4ById.get(698)?.[1], '真ん中');
  assert.equal(n4ById.get(875)?.[1], '落とす');
  assert.equal(n4ById.get(876)?.[1], '落ちる');
});
