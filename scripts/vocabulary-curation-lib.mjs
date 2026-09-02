import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const LEVEL_RANGES = {
  N5: { firstId: 1, count: 459 },
  N4: { firstId: 460, count: 432 },
};

export function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function loadMigrationDatabase() {
  const database = new DatabaseSync(':memory:');
  const migrationFiles = fs
    .readdirSync('drizzle')
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();

  for (const file of migrationFiles) {
    database.exec(
      fs
        .readFileSync(path.join('drizzle', file), 'utf8')
        .replaceAll('--> statement-breakpoint', ''),
    );
  }

  return database;
}

export function loadCuration(level) {
  const normalizedLevel = String(level).toUpperCase();
  const file = path.join('content', 'vocabulary', `${normalizedLevel.toLowerCase()}.pt.json`);
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  const expected = LEVEL_RANGES[normalizedLevel];

  if (!expected || document.level !== normalizedLevel || !Array.isArray(document.entries)) {
    throw new Error(`Arquivo de curadoria inválido: ${file}.`);
  }

  const entries = document.entries.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 5) {
      throw new Error(`Entrada inválida em ${file}: ${JSON.stringify(entry)}.`);
    }
    const [id, word, reading, promptPt, meaningsPt] = entry;
    if (
      !Number.isInteger(id)
      || !word?.trim()
      || !reading?.trim()
      || !promptPt?.trim()
      || !Array.isArray(meaningsPt)
      || meaningsPt.length === 0
      || meaningsPt.some((meaning) => typeof meaning !== 'string' || !meaning.trim())
    ) {
      throw new Error(`Campos inválidos no ID ${id} de ${file}.`);
    }
    return { id, word, reading, promptPt, meaningsPt };
  });

  const expectedIds = Array.from(
    { length: expected.count },
    (_, index) => expected.firstId + index,
  );
  const ids = entries.map(({ id }) => id);
  if (entries.length !== expected.count || JSON.stringify(ids) !== JSON.stringify(expectedIds)) {
    throw new Error(
      `${normalizedLevel}: esperados ${expected.count} IDs contínuos a partir de ${expected.firstId}.`,
    );
  }

  const promptOwners = new Map();
  const headwordOwners = new Map();
  for (const entry of entries) {
    const promptKey = entry.promptPt.toLocaleLowerCase('pt-BR');
    const headwordKey = `${entry.word}\u0000${entry.reading}`;
    if (promptOwners.has(promptKey)) {
      throw new Error(
        `${normalizedLevel}: pista repetida nos IDs ${promptOwners.get(promptKey)} e ${entry.id}: ${entry.promptPt}.`,
      );
    }
    if (headwordOwners.has(headwordKey)) {
      throw new Error(
        `${normalizedLevel}: palavra/leitura repetida nos IDs ${headwordOwners.get(headwordKey)} e ${entry.id}.`,
      );
    }
    promptOwners.set(promptKey, entry.id);
    headwordOwners.set(headwordKey, entry.id);

    const normalizedMeanings = entry.meaningsPt.map((meaning) => meaning.toLocaleLowerCase('pt-BR').trim());
    if (new Set(normalizedMeanings).size !== normalizedMeanings.length) {
      throw new Error(`${normalizedLevel}: significados repetidos no ID ${entry.id}.`);
    }
  }

  return { level: normalizedLevel, file, entries };
}

export function auditCuration(curation, database = loadMigrationDatabase()) {
  const sourceRows = database
    .prepare(
      'SELECT id, word, reading, jlpt_level AS level FROM vocabulary_catalog WHERE jlpt_level = ? ORDER BY id',
    )
    .all(curation.level);
  const sourceById = new Map(sourceRows.map((row) => [Number(row.id), row]));
  const missingSourceIds = curation.entries
    .filter(({ id }) => !sourceById.has(id))
    .map(({ id }) => id);
  if (missingSourceIds.length) {
    throw new Error(`${curation.level}: IDs ausentes do catálogo-base: ${missingSourceIds.join(', ')}.`);
  }

  const targetKeys = new Map(
    curation.entries.map((entry) => [`${entry.word}\u0000${entry.reading}`, entry.id]),
  );
  const collisions = database
    .prepare(
      'SELECT id, word, reading, jlpt_level AS level FROM vocabulary_catalog WHERE jlpt_level <> ? ORDER BY id',
    )
    .all(curation.level)
    .flatMap((row) => {
      const curatedId = targetKeys.get(`${row.word}\u0000${row.reading}`);
      return curatedId === undefined
        ? []
        : [{ curatedId, existingId: Number(row.id), existingLevel: row.level, word: row.word, reading: row.reading }];
    });

  const changedHeadwords = curation.entries.flatMap((entry) => {
    const source = sourceById.get(entry.id);
    return source.word === entry.word && source.reading === entry.reading
      ? []
      : [{
          id: entry.id,
          before: `${source.word}（${source.reading}）`,
          after: `${entry.word}（${entry.reading}）`,
        }];
  });

  return { sourceRows, collisions, changedHeadwords };
}

