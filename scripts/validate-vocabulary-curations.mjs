import fs from 'node:fs';
import path from 'node:path';
import {
  auditCuration,
  loadCuration,
  loadMigrationDatabase,
} from './vocabulary-curation-lib.mjs';

const levels = fs
  .readdirSync(path.join('content', 'vocabulary'))
  .filter((file) => /^n[1-5]\.pt\.json$/i.test(file))
  .map((file) => file.slice(0, 2).toUpperCase())
  .sort((left, right) => Number(right.slice(1)) - Number(left.slice(1)));
const database = loadMigrationDatabase();
const reports = [];
const globalHeadwords = new Map();

for (const level of levels) {
  const curation = loadCuration(level);
  const audit = auditCuration(curation, database);
  for (const entry of curation.entries) {
    const key = `${entry.word}\u0000${entry.reading}`;
    if (globalHeadwords.has(key)) {
      throw new Error(
        `Colisão entre curadorias: ${entry.word}（${entry.reading}） em ${globalHeadwords.get(key)} e ${level}/${entry.id}.`,
      );
    }
    globalHeadwords.set(key, `${level}/${entry.id}`);
  }
  reports.push({
    level,
    curated: curation.entries.length,
    changedHeadwords: audit.changedHeadwords,
    catalogCollisions: audit.collisions,
  });
}

console.log(JSON.stringify({ levels: reports }, null, 2));

