import fs from 'node:fs';
import path from 'node:path';
import {
  auditCuration,
  loadCuration,
  sqlText,
} from './vocabulary-curation-lib.mjs';

const level = String(process.argv[2] ?? '').toUpperCase();
const outputFile = process.argv[3] ?? path.join('work', `vocabulary-${level.toLowerCase()}-curation.sql`);
const curation = loadCuration(level);
const audit = auditCuration(curation);

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

const stageTable = `vocabulary_${level.toLowerCase()}_curation_stage`;
const statements = [
  `DROP TABLE IF EXISTS \`${stageTable}\`;`,
  `CREATE TABLE \`${stageTable}\` (\`id\` integer PRIMARY KEY, \`word\` text NOT NULL, \`reading\` text NOT NULL, \`prompt_pt\` text NOT NULL, \`meanings_pt_json\` text NOT NULL);`,
];

for (const group of chunks(curation.entries, 75)) {
  const values = group.map((entry) => (
    `(${entry.id}, ${sqlText(entry.word)}, ${sqlText(entry.reading)}, ${sqlText(entry.promptPt)}, ${sqlText(JSON.stringify(entry.meaningsPt))})`
  ));
  statements.push(
    `INSERT INTO \`${stageTable}\` (\`id\`, \`word\`, \`reading\`, \`prompt_pt\`, \`meanings_pt_json\`) VALUES\n${values.join(',\n')};`,
  );
}

statements.push(
  "UPDATE `vocabulary_practice_sessions` SET `status` = 'abandoned', `current_vocabulary_id` = NULL, `updated_at` = CURRENT_TIMESTAMP WHERE `status` = 'active';",
);
if (audit.collisions.length) {
  statements.push(
    `DELETE FROM \`vocabulary_catalog\` WHERE \`id\` IN (${audit.collisions.map(({ existingId }) => existingId).join(', ')});`,
  );
}
statements.push(
  `UPDATE \`vocabulary_catalog\`
SET
  \`word\` = (SELECT stage.word FROM \`${stageTable}\` AS stage WHERE stage.id = \`vocabulary_catalog\`.\`id\`),
  \`reading\` = (SELECT stage.reading FROM \`${stageTable}\` AS stage WHERE stage.id = \`vocabulary_catalog\`.\`id\`),
  \`prompt_pt\` = (SELECT stage.prompt_pt FROM \`${stageTable}\` AS stage WHERE stage.id = \`vocabulary_catalog\`.\`id\`),
  \`meanings_pt_json\` = (SELECT stage.meanings_pt_json FROM \`${stageTable}\` AS stage WHERE stage.id = \`vocabulary_catalog\`.\`id\`)
WHERE \`jlpt_level\` = ${sqlText(level)};`,
  `DROP TABLE \`${stageTable}\`;`,
  'PRAGMA optimize;',
);

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${statements.join('\n--> statement-breakpoint\n')}\n`, 'utf8');

console.log(JSON.stringify({
  level,
  curated: curation.entries.length,
  collisions: audit.collisions,
  changedHeadwords: audit.changedHeadwords,
  outputFile,
}, null, 2));
