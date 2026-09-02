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

const curation = JSON.parse(
  fs.readFileSync('content/vocabulary/n5.pt.json', 'utf8'),
) as { level: string; entries: CuratedEntry[] };

const byId = new Map(curation.entries.map((entry) => [entry[0], entry]));

test('a curadoria cobre exatamente as 459 entradas N5', () => {
  assert.equal(curation.level, 'N5');
  assert.equal(curation.entries.length, 459);
  assert.equal(new Set(curation.entries.map(([id]) => id)).size, 459);
  assert.deepEqual(curation.entries.map(([id]) => id), Array.from({ length: 459 }, (_, index) => index + 1));
});

test('pistas e pares palavra/leitura são únicos', () => {
  const prompts = curation.entries.map(([, , , prompt]) => prompt);
  const headwords = curation.entries.map(([, word, reading]) => `${word}\u0000${reading}`);
  assert.equal(new Set(prompts).size, prompts.length);
  assert.equal(new Set(headwords).size, headwords.length);
});

test('nenhuma entrada contém tradução vazia, repetida ou resíduo do inglês', () => {
  for (const [id, word, , prompt, meanings] of curation.entries) {
    assert.ok(prompt.trim(), `pista vazia no id ${id}: ${word}`);
    assert.ok(meanings.length > 0, `significados vazios no id ${id}: ${word}`);
    assert.equal(new Set(meanings.map((meaning) => meaning.toLocaleLowerCase('pt-BR').trim())).size, meanings.length);
    assert.doesNotMatch(`${prompt} ${meanings.join(' ')}`, /\b(to |the |half minute|fouth|luke warm|forma honorífica:)\b/i);
  }
});

test('casos semanticamente perigosos foram curados explicitamente', () => {
  assert.deepEqual(byId.get(4), [4, 'お皿', 'おさら', 'prato; louça', ['prato', 'louça']]);
  assert.equal(byId.get(68)?.[3], 'abrir-se; ficar aberto');
  assert.equal(byId.get(69)?.[3], 'abrir alguma coisa');
  assert.equal(byId.get(140)?.[3], 'grosso; espesso (objetos planos ou camadas)');
  assert.equal(byId.get(241)?.[3], 'levantar; elevar; aumentar');
  assert.equal(byId.get(289)?.[3], 'grosso (grande diâmetro)');
  assert.equal(byId.get(365)?.[1], 'お祖父さん');
  assert.deepEqual(byId.get(375)?.[4], ['metade', 'meia porção', 'cinquenta por cento']);
  assert.equal(byId.get(419)?.[1], '明るい');
});
