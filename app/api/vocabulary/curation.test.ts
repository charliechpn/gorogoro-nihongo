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
const n3Curation = JSON.parse(
  fs.readFileSync('content/vocabulary/n3.pt.json', 'utf8'),
) as { level: string; entries: CuratedEntry[] };
const n2Curation = JSON.parse(
  fs.readFileSync('content/vocabulary/n2.pt.json', 'utf8'),
) as { level: string; entries: CuratedEntry[] };
const n1Curation = JSON.parse(
  fs.readFileSync('content/vocabulary/n1.pt.json', 'utf8'),
) as { level: string; entries: CuratedEntry[] };

const n5ById = new Map(n5Curation.entries.map((entry) => [entry[0], entry]));
const n4ById = new Map(n4Curation.entries.map((entry) => [entry[0], entry]));
const n3ById = new Map(n3Curation.entries.map((entry) => [entry[0], entry]));
const n2ById = new Map(n2Curation.entries.map((entry) => [entry[0], entry]));
const n1ById = new Map(n1Curation.entries.map((entry) => [entry[0], entry]));

function rangeIds(firstId: number, lastId: number, excludedIds: number[] = []) {
  const exclusions = new Set(excludedIds);
  return Array.from(
    { length: lastId - firstId + 1 },
    (_, index) => firstId + index,
  ).filter((id) => !exclusions.has(id));
}

function assertCurationIntegrity(
  curation: { level: string; entries: CuratedEntry[] },
  expectedIds: number[],
) {
  const expectedCount = expectedIds.length;
  assert.equal(curation.entries.length, expectedCount);
  assert.equal(new Set(curation.entries.map(([id]) => id)).size, expectedCount);
  assert.deepEqual(
    curation.entries.map(([id]) => id),
    expectedIds,
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
  assertCurationIntegrity(n5Curation, rangeIds(1, 459));
});

test('a curadoria cobre exatamente as 432 entradas N4', () => {
  assert.equal(n4Curation.level, 'N4');
  assertCurationIntegrity(n4Curation, rangeIds(460, 891));
});

test('a curadoria cobre exatamente as 1.304 entradas únicas N3', () => {
  assert.equal(n3Curation.level, 'N3');
  assertCurationIntegrity(n3Curation, rangeIds(892, 2223, [
    904, 951, 952, 965, 1084, 1212, 1216, 1246, 1266, 1274, 1391, 1497,
    1498, 1504, 1533, 1536, 1569, 1583, 1628, 1652, 1683, 1714, 1779, 1917,
    1918, 2076, 2144, 2145,
  ]));
});

test('a curadoria cobre exatamente as 1.201 entradas únicas N2', () => {
  assert.equal(n2Curation.level, 'N2');
  assertCurationIntegrity(n2Curation, rangeIds(2224, 3434, [
    2523, 2530, 2555, 2602, 2603, 2604, 2983, 3179, 3245, 3326,
  ]));
});

test('a curadoria cobre exatamente as 2.552 entradas únicas N1', () => {
  assert.equal(n1Curation.level, 'N1');
  assertCurationIntegrity(n1Curation, rangeIds(3435, 6029, [
    3449, 3463, 3465, 3540, 3620, 3780, 3906, 4001, 4072, 4123, 4154, 4186,
    4378, 4409, 4450, 4583, 4604, 4610, 4626, 4667, 4701, 4716, 4786, 4991,
    5029, 5058, 5083, 5102, 5157, 5199, 5315, 5342, 5418, 5440, 5487, 5590,
    5592, 5620, 5822, 5931, 5935, 5952, 6018,
  ]));
});

test('as curadorias não repetem palavra/leitura entre níveis', () => {
  const entries = [
    ...n5Curation.entries,
    ...n4Curation.entries,
    ...n3Curation.entries,
    ...n2Curation.entries,
    ...n1Curation.entries,
  ];
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

  assert.equal(n3ById.get(1371)?.[2], 'さんせい');
  assert.equal(n3ById.get(1387)?.[3], 'sustentar; apoiar');
  assert.equal(n3ById.get(1471)?.[3], 'estado; província');
  assert.equal(n3ById.get(1610)?.[3], 'popularidade');
  assert.equal(n3ById.get(1653)?.[3], 'tecido; massa crua');
  assert.equal(n3ById.get(1654)?.[3], 'ser vivo; organismo');
  assert.equal(n3ById.get(1656)?.[3], 'auge; plenitude');
  assert.equal(n3ById.get(1754)?.[3], 'proprietário de imóvel alugado');
  assert.equal(n3ById.get(1949)?.[3], 'especialista; doutor');
  assert.equal(n3ById.get(2056)?.[3], 'mudança; transformação');
  assert.equal(n3ById.get(2189)?.[3], 'terra firme; continente');

  assert.equal(n2ById.has(2530), false);
  assert.equal(n2ById.get(2562)?.[3], 'engenho; ideia prática');
  assert.equal(n2ById.get(2571)?.[3], 'folhas de outono; mudança de cor das folhas');
  assert.equal(n2ById.get(2848)?.[3], 'ciências humanas');
  assert.equal(n2ById.get(2851)?.[3], 'enciclopédia ilustrada');
  assert.equal(n2ById.get(2962)?.[1], '率直');
  assert.equal(n2ById.get(3104)?.[1], '田んぼ');
  assert.equal(n2ById.get(3115)?.[3], 'esforçar-se; empenhar-se');
  assert.equal(n2ById.get(3128)?.[3], 'estatística; dados estatísticos');
  assert.equal(n2ById.get(3196)?.[3], 'ideia; concepção');
  assert.equal(n2ById.get(3203)?.[2], 'そる');
  assert.equal(n2ById.get(3434)?.[1], '対立');

  assert.equal(n1ById.get(3476)?.[2], 'あいぞう');
  assert.equal(n1ById.get(3483)?.[2], 'あくにち');
  assert.equal(n1ById.get(3527)?.[2], 'ひとすじ');
  assert.equal(n1ById.get(3868)?.[2], 'きぞう');
  assert.equal(n1ById.get(3887)?.[3], 'elegância; dignidade');
  assert.equal(n1ById.get(3926)?.[1], '遡る');
  assert.equal(n1ById.get(4371)?.[2], 'さんばし');
  assert.equal(n1ById.get(4702)?.[3], 'marrom-escuro');
  assert.equal(n1ById.get(4791)?.[2], 'まごころ');
  assert.equal(n1ById.get(5160)?.[2], 'ちけい');
  assert.equal(n1ById.get(5438)?.[3], 'quantidade de calor; calorias');
  assert.equal(n1ById.get(5501)?.[2], 'ほっそく');
});
