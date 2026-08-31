import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'public', 'data', 'kanji.json');
const migrationDirectory = path.join(root, 'drizzle');

const quote = (value) => value === null || value === undefined
  ? 'NULL'
  : `'${String(value).replaceAll("'", "''")}'`;

const payload = JSON.parse(await readFile(sourcePath, 'utf8'));
if (payload.count !== 1006 || payload.kanji?.length !== 1006) {
  throw new Error('O seed exige exatamente os 1.006 kanjis escolares.');
}

const migrationFiles = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith('.sql'))
  .sort();

if (migrationFiles.length !== 1) {
  throw new Error(`Esperava uma migração inicial; encontrei ${migrationFiles.length}.`);
}

const migrationPath = path.join(migrationDirectory, migrationFiles[0]);
let sql = await readFile(migrationPath, 'utf8');
const marker = '-- KANJI_CATALOG_SEED_V1';

if (sql.includes(marker)) {
  console.log('Seed dos kanjis já está presente.');
  process.exit(0);
}

const chunks = [];
for (let start = 0; start < payload.kanji.length; start += 100) {
  const rows = payload.kanji.slice(start, start + 100).map((item) => `(${[
    item.id,
    quote(item.kanji),
    quote(item.meaning),
    quote(item.onyomi || null),
    quote(item.kunyomi || null),
    item.grade,
    quote(item.jlpt || null),
    quote(JSON.stringify(item.fullWords ?? [])),
  ].join(', ')})`);

  chunks.push([
    'INSERT INTO `kanji_catalog`',
    '(`id`, `character`, `meaning_pt`, `onyomi`, `kunyomi`, `grade`, `jlpt_level`, `full_words_json`)',
    `VALUES\n${rows.join(',\n')};`,
  ].join('\n'));
}

sql += `\n--> statement-breakpoint\n${marker}\n${chunks.join('\n--> statement-breakpoint\n')}\n--> statement-breakpoint\nPRAGMA optimize;\n`;
await writeFile(migrationPath, sql, 'utf8');
console.log(`Seed anexado: ${payload.kanji.length} kanjis em ${chunks.length} lotes.`);
