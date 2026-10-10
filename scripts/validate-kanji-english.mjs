import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadKanjiEnglishCurations } from './kanji-english-curation.mjs';

const catalog = JSON.parse(fs.readFileSync('public/data/kanji.json', 'utf8'));
const translations = loadKanjiEnglishCurations(catalog.kanji);
const japaneseReviewFiles = [
  'grade-1/primeiro-ano-revisao.json',
  'grade-2/segundo-ano-revisao.json',
  'grade-3/terceiro-ano-revisao.json',
  'grade-4/quarto-ano-revisao.json',
  'grade-5/quinto-ano-revisao.json',
  'grade-6/sexto-ano-revisao.json',
];
const japaneseReviews = japaneseReviewFiles.flatMap((file) =>
  JSON.parse(fs.readFileSync(path.join('content', 'kanji-review', file), 'utf8')).entries);
const japaneseReviewById = new Map(japaneseReviews.map((entry) => [entry.id, entry]));
assert.equal(japaneseReviews.length, catalog.count, 'Every kanji needs an individual Japanese review.');
assert.equal(japaneseReviewById.size, catalog.count, 'Japanese review IDs must be unique.');
for (const row of catalog.kanji) {
  const review = japaneseReviewById.get(row.id);
  assert.equal(review?.kanji, row.kanji, `Japanese review character mismatch at ID ${row.id}.`);
  assert.equal(review?.proposed?.meaning, row.meaning,
    `Portuguese meaning differs from its Japanese review at ID ${row.id}.`);
}
const pilot = new Map([...translations].filter(([id]) => id >= 1 && id <= 50));
assert.equal(pilot.size, 50, 'The pilot must contain exactly the first 50 kanji.');
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const sqlUpdate = ({ id, kanji, meaningPt, meaningEn }) =>
  `UPDATE kanji_catalog SET meaning_en=${quote(meaningEn)} WHERE id=${id} AND character=${quote(kanji)} AND meaning_pt=${quote(meaningPt)};`;
const reviewedIds = [13, 14, 31, 45];
const updates = reviewedIds.map((id) => sqlUpdate(pilot.get(id)));
const expectedReviewMigration = `${updates.join('\n--> statement-breakpoint\n')}\n`;
const batchMigrations = [
  { firstId: 51, lastId: 80, file: '0007_kanji_english_grade1_completion.sql' },
  { firstId: 81, lastId: 120, file: '0008_kanji_english_grade2_081_120.sql' },
  { firstId: 121, lastId: 240, file: '0009_kanji_english_grade2_completion.sql' },
  { firstId: 241, lastId: 440, file: '0010_kanji_english_grade3.sql' },
  { firstId: 441, lastId: 640, file: '0011_kanji_english_grade4.sql' },
  { firstId: 641, lastId: 825, file: '0012_kanji_english_grade5.sql' },
  { firstId: 826, lastId: 1006, file: '0013_kanji_english_grade6.sql' },
];
const editorialReviewFile = '0014_kanji_english_editorial_review.sql';
const previousEnglishById = new Map([
  [241, 'city block; counting unit'],
  [385, 'ordinal prefix; order number'],
  [651, 'straw bale for grain'],
  [821, 'not; negation; error'],
  [1000, 'Majesty; steps to the throne'],
]);
const expectedBatchMigration = ({ firstId, lastId }) => {
  const entries = [...translations.values()].filter(({ id }) => id >= firstId && id <= lastId);
  assert.equal(entries.length, lastId - firstId + 1,
    `Incomplete English translation batch for IDs ${firstId}–${lastId}.`);
  return `${entries.map((entry) => sqlUpdate({
    ...entry,
    meaningEn: previousEnglishById.get(entry.id) ?? entry.meaningEn,
  })).join('\n--> statement-breakpoint\n')}\n`;
};
const editorialUpdates = [...previousEnglishById.keys()].map((id) => sqlUpdate(translations.get(id)));
const expectedEditorialMigration = `${editorialUpdates.join('\n--> statement-breakpoint\n')}\n`;
const writeMigration = process.argv.find((arg) => arg.startsWith('--write-migration='))?.split('=')[1];
if (writeMigration) {
  if (writeMigration === editorialReviewFile) {
    fs.writeFileSync(path.join('drizzle', editorialReviewFile), expectedEditorialMigration, 'utf8');
    console.log(`Wrote ${editorialUpdates.length} editorial corrections to ${editorialReviewFile}.`);
    process.exit(0);
  }
  const batch = batchMigrations.find(({ file }) => file === writeMigration);
  assert.ok(batch, `Unknown English translation migration: ${writeMigration}.`);
  fs.writeFileSync(path.join('drizzle', batch.file), expectedBatchMigration(batch), 'utf8');
  console.log(`Wrote English kanji translations for IDs ${batch.firstId}–${batch.lastId}.`);
  process.exit(0);
}
if (process.argv.includes('--write-json')) {
  catalog.version = 2;
  for (const row of catalog.kanji) {
    const meaningEn = translations.get(row.id)?.meaningEn;
    if (meaningEn) row.meaningEn = meaningEn;
    else delete row.meaningEn;
  }
  fs.writeFileSync('public/data/kanji.json', `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${translations.size} reviewed kanji translations to the static catalog.`);
  process.exit(0);
}

assert.equal(catalog.version, 2, 'The static catalog version must reflect the bilingual field.');
const initialMigration = fs.readFileSync('drizzle/0005_kanji_english_pilot.sql', 'utf8');
assert.match(initialMigration, /ALTER TABLE `kanji_catalog` ADD `meaning_en` text;/);
assert.equal((initialMigration.match(/UPDATE kanji_catalog SET meaning_en=/g) ?? []).length, 50,
  'The original pilot migration must retain its 50 English translations.');
assert.equal(
  fs.readFileSync('drizzle/0006_kanji_english_review.sql', 'utf8').replaceAll('\r\n', '\n'),
  expectedReviewMigration,
  'The review migration must match the final curation exactly.',
);
for (const batch of batchMigrations) {
  assert.equal(
    fs.readFileSync(path.join('drizzle', batch.file), 'utf8').replaceAll('\r\n', '\n'),
    expectedBatchMigration(batch),
    `Migration ${batch.file} must match the curation exactly.`,
  );
}
assert.equal(
  fs.readFileSync(path.join('drizzle', editorialReviewFile), 'utf8').replaceAll('\r\n', '\n'),
  expectedEditorialMigration,
  'The editorial review migration must match the final curation exactly.',
);

for (const row of catalog.kanji) {
  assert.equal(row.meaningEn ?? null, translations.get(row.id)?.meaningEn ?? null,
    `Static catalog English mismatch at kanji ID ${row.id}.`);
}

const database = new DatabaseSync(':memory:');
const files = fs.readdirSync('drizzle').filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
for (const file of files) {
  database.exec(fs.readFileSync(path.join('drizzle', file), 'utf8').replaceAll('--> statement-breakpoint', ''));
}
const rows = database.prepare('SELECT id, character, meaning_pt, meaning_en FROM kanji_catalog ORDER BY id').all();
assert.equal(rows.length, catalog.count);
assert.equal(rows.filter((row) => row.meaning_en !== null).length, translations.size);
const sourceById = new Map(catalog.kanji.map((row) => [row.id, row]));
for (const row of rows) {
  const source = sourceById.get(row.id);
  assert.ok(source, `Missing static kanji ID ${row.id}.`);
  assert.equal(row.character, source.kanji);
  assert.equal(row.meaning_pt, source.meaning);
  assert.equal(row.meaning_en, translations.get(row.id)?.meaningEn ?? null);
}
database.close();
console.log(`Validated ${translations.size} English kanji meanings; ${rows.length} IDs and Portuguese meanings preserved.`);
