import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const databasePath = resolve(process.argv[2] ?? 'kanjis/kanji database 1.db');
const outputPath = resolve(process.argv[3] ?? 'public/data/kanji.json');

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
      full_words AS fullWords
    FROM kanji
    ORDER BY id
  `)
  .all();

database.close();

const rows = databaseRows.map((row) => ({
  ...row,
  fullWords: JSON.parse(row.fullWords),
}));

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify({ version: 1, count: rows.length, kanji: rows }, null, 2)}\n`,
  'utf8',
);

console.log(`Exportados ${rows.length} kanjis para ${outputPath}`);
