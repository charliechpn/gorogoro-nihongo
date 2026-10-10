import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const catalogPath = 'public/data/onomatopoeia.json';
const curationDirectory = 'content/onomatopoeia/en';
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const files = fs.readdirSync(curationDirectory).filter((file) => file.endsWith('.json')).sort();
const schema = ['id', 'term', 'meaningEn'];
const sourceById = new Map(catalog.onomatopoeia.map((entry) => [entry.id, entry]));
const translations = new Map();
const seenEnglish = new Map();

assert.equal(catalog.count, 189);
assert.equal(catalog.onomatopoeia.length, catalog.count);
assert.equal(sourceById.size, catalog.count, 'Source IDs must be unique.');
assert.equal(files.length, 4, 'Expected four reviewed English curation blocks.');

for (const file of files) {
  const document = JSON.parse(fs.readFileSync(path.join(curationDirectory, file), 'utf8'));
  assert.equal(document.version, 1, `Invalid curation version in ${file}.`);
  assert.deepEqual(document.schema, schema, `Invalid curation schema in ${file}.`);
  const [firstId, lastId] = document.range;
  assert.equal(document.entries.length, lastId - firstId + 1, `Incomplete block ${file}.`);

  for (const [index, row] of document.entries.entries()) {
    assert.equal(row.length, schema.length, `Invalid entry at index ${index} in ${file}.`);
    const [id, term, meaningEn] = row;
    assert.equal(id, firstId + index, `Noncontiguous ID in ${file}.`);
    assert.equal(sourceById.get(id)?.term, term, `Source term mismatch at ID ${id}.`);
    assert.ok(typeof meaningEn === 'string' && meaningEn.trim() === meaningEn && meaningEn,
      `Missing or untrimmed English meaning at ID ${id}.`);
    assert.ok(!translations.has(id), `Duplicate curation ID ${id}.`);
    const normalizedMeaning = meaningEn.toLocaleLowerCase('en');
    assert.ok(!seenEnglish.has(normalizedMeaning),
      `Duplicate English choice text at IDs ${seenEnglish.get(normalizedMeaning)} and ${id}.`);
    seenEnglish.set(normalizedMeaning, id);
    translations.set(id, meaningEn);
  }
}

assert.equal(translations.size, catalog.count, 'English curation does not cover the full corpus.');

if (process.argv.includes('--write-json')) {
  catalog.version = 2;
  for (const row of catalog.onomatopoeia) row.meaningEn = translations.get(row.id);
  fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${translations.size} English onomatopoeia meanings.`);
  process.exit(0);
}

assert.equal(catalog.version, 2, 'Static catalog must use bilingual version 2.');
for (const row of catalog.onomatopoeia) {
  assert.equal(row.meaningEn, translations.get(row.id), `Static English mismatch at ID ${row.id}.`);
  assert.ok(row.meaningPt && row.meaningJa && Array.isArray(row.categories),
    `Existing content is incomplete at ID ${row.id}.`);
}
console.log(`Validated ${translations.size} unique English onomatopoeia meanings; Japanese and Portuguese fields retained.`);
