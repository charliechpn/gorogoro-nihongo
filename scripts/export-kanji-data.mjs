import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadKanjiEnglishCurations } from './kanji-english-curation.mjs';

const databasePath = resolve(process.argv[2] ?? 'kanjis/kanji database 1.db');
const outputPath = resolve(process.argv[3] ?? 'public/data/kanji.json');
const wordsPath = resolve('public/data/kanji.json');

// The curated SQLite source no longer stores fullWords. Keep those lists from
// the existing static catalog and verify their ID/character match before writing.
const wordCatalog = JSON.parse(await readFile(wordsPath, 'utf8'));
const wordsById = new Map(wordCatalog.kanji.map((row) => [row.id, row]));

const database = new DatabaseSync(databasePath, { readOnly: true });
const databaseRows = database
  .prepare(`
    SELECT
      id,
      kanji,
      meaning_pt AS meaning,
      onyomi,
      kunyomi,
      school_grade AS grade,
      jlpt_level AS jlpt,
      review_tag AS reviewTag,
      review_note AS reviewNote
    FROM kanji
    ORDER BY id
  `)
  .all();

database.close();

const english = loadKanjiEnglishCurations(databaseRows);
if (databaseRows.length !== wordCatalog.kanji.length) {
  throw new Error('Kanji count mismatch between SQLite and the static word catalog.');
}
const rows = databaseRows.map((row) => {
  const stored = wordsById.get(row.id);
  if (stored?.kanji !== row.kanji || !Array.isArray(stored.fullWords)) {
    throw new Error(`Missing or mismatched fullWords for kanji ID ${row.id}.`);
  }
  return {
    id: row.id,
    kanji: row.kanji,
    meaning: row.meaning,
    onyomi: row.onyomi,
    kunyomi: row.kunyomi,
    grade: row.grade,
    jlpt: row.jlpt,
    fullWords: stored.fullWords,
    reviewTag: row.reviewTag,
    reviewNote: row.reviewNote,
    ...(english.has(row.id) ? { meaningEn: english.get(row.id).meaningEn } : {}),
  };
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify({ version: 2, count: rows.length, kanji: rows }, null, 2)}\n`,
  'utf8',
);

console.log(`Exportados ${rows.length} kanjis para ${outputPath}`);
