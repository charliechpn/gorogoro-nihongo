import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const CURATION_FILE = "content/vocabulary/n5.pt.json";
const MIGRATION_FILE = "drizzle/0002_glorious_supernaut.sql";
const START_MARKER = "-- VOCABULARY_N5_CURATION_V1";
const END_MARKER = "-- END_VOCABULARY_N5_CURATION_V1";

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

const curation = JSON.parse(fs.readFileSync(CURATION_FILE, "utf8"));
if (curation.level !== "N5" || !Array.isArray(curation.entries)) {
  throw new Error("O arquivo de curadoria N5 possui formato inválido.");
}

const entries = curation.entries.map((entry) => {
  if (!Array.isArray(entry) || entry.length !== 5) {
    throw new Error(`Entrada de curadoria inválida: ${JSON.stringify(entry)}`);
  }
  const [id, word, reading, promptPt, meaningsPt] = entry;
  if (
    !Number.isInteger(id)
    || typeof word !== "string"
    || !word.trim()
    || typeof reading !== "string"
    || !reading.trim()
    || typeof promptPt !== "string"
    || !promptPt.trim()
    || !Array.isArray(meaningsPt)
    || meaningsPt.length === 0
    || meaningsPt.some((meaning) => typeof meaning !== "string" || !meaning.trim())
  ) {
    throw new Error(`Entrada de curadoria inválida para o id ${id}.`);
  }
  return { id, word, reading, promptPt, meaningsPt };
});

const ids = new Set(entries.map((entry) => entry.id));
if (entries.length !== 459 || ids.size !== 459) {
  throw new Error(`Esperadas 459 entradas N5 únicas; recebidas ${entries.length}/${ids.size}.`);
}

const database = new DatabaseSync(":memory:");
for (const file of [
  "drizzle/0000_perpetual_stark_industries.sql",
  "drizzle/0001_violet_brood.sql",
]) {
  database.exec(fs.readFileSync(file, "utf8").replaceAll("--> statement-breakpoint", ""));
}

const sourceRows = database
  .prepare("SELECT id, word, reading, jlpt_level AS level FROM vocabulary_catalog WHERE jlpt_level = 'N5' ORDER BY id")
  .all();
if (sourceRows.length !== 459 || sourceRows.some((row) => !ids.has(Number(row.id)))) {
  throw new Error("A curadoria não corresponde exatamente às 459 linhas N5 do catálogo.");
}

const targetKeys = new Map();
for (const entry of entries) {
  const key = `${entry.word}\u0000${entry.reading}`;
  if (targetKeys.has(key)) {
    throw new Error(`Par palavra/leitura duplicado na curadoria: ${entry.word}（${entry.reading}）.`);
  }
  targetKeys.set(key, entry.id);
}

const collisions = [];
for (const row of database.prepare("SELECT id, word, reading, jlpt_level AS level FROM vocabulary_catalog WHERE jlpt_level <> 'N5'").all()) {
  const key = `${row.word}\u0000${row.reading}`;
  if (targetKeys.has(key)) {
    collisions.push({ curatedId: targetKeys.get(key), existingId: row.id, level: row.level, word: row.word, reading: row.reading });
  }
}
const prompts = new Map();
for (const entry of entries) {
  const owners = prompts.get(entry.promptPt) ?? [];
  owners.push(entry.id);
  prompts.set(entry.promptPt, owners);
}
const duplicatePrompts = [...prompts.entries()].filter(([, owners]) => owners.length > 1);
if (duplicatePrompts.length) {
  throw new Error(`Pistas PT duplicadas: ${JSON.stringify(duplicatePrompts)}`);
}

const changedHeadwords = entries.flatMap((entry) => {
  const source = sourceRows.find((row) => Number(row.id) === entry.id);
  return source.word === entry.word && source.reading === entry.reading
    ? []
    : [{
        id: entry.id,
        before: `${source.word}（${source.reading}）`,
        after: `${entry.word}（${entry.reading}）`,
      }];
});

const statements = [
  START_MARKER,
  "UPDATE `vocabulary_practice_sessions` SET `status` = 'abandoned', `current_vocabulary_id` = NULL, `updated_at` = CURRENT_TIMESTAMP WHERE `status` = 'active';",
  "--> statement-breakpoint",
];

if (collisions.length) {
  statements.push(
    `DELETE FROM \`vocabulary_catalog\` WHERE \`id\` IN (${collisions.map((collision) => collision.existingId).join(", ")});`,
    "--> statement-breakpoint",
  );
}

statements.push(
  "CREATE TABLE `vocabulary_n5_curation` (`id` integer PRIMARY KEY, `word` text NOT NULL, `reading` text NOT NULL, `prompt_pt` text NOT NULL, `meanings_pt_json` text NOT NULL);",
  "--> statement-breakpoint",
);

for (const group of chunks(entries, 75)) {
  const values = group.map((entry) => `(${entry.id}, ${sqlText(entry.word)}, ${sqlText(entry.reading)}, ${sqlText(entry.promptPt)}, ${sqlText(JSON.stringify(entry.meaningsPt))})`);
  statements.push(
    "INSERT INTO `vocabulary_n5_curation` (`id`, `word`, `reading`, `prompt_pt`, `meanings_pt_json`) VALUES\n" + values.join(",\n") + ";",
    "--> statement-breakpoint",
  );
}

statements.push(
  `UPDATE \`vocabulary_catalog\`
SET
  \`word\` = (SELECT c.word FROM \`vocabulary_n5_curation\` AS c WHERE c.id = \`vocabulary_catalog\`.\`id\`),
  \`reading\` = (SELECT c.reading FROM \`vocabulary_n5_curation\` AS c WHERE c.id = \`vocabulary_catalog\`.\`id\`),
  \`prompt_pt\` = (SELECT c.prompt_pt FROM \`vocabulary_n5_curation\` AS c WHERE c.id = \`vocabulary_catalog\`.\`id\`),
  \`meanings_pt_json\` = (SELECT c.meanings_pt_json FROM \`vocabulary_n5_curation\` AS c WHERE c.id = \`vocabulary_catalog\`.\`id\`)
WHERE \`jlpt_level\` = 'N5';`,
  "--> statement-breakpoint",
  "DROP TABLE `vocabulary_n5_curation`;",
  "--> statement-breakpoint",
  "PRAGMA optimize;",
  END_MARKER,
);

let migration = fs.readFileSync(MIGRATION_FILE, "utf8").trimEnd();
const previousStart = migration.indexOf(START_MARKER);
if (previousStart >= 0) migration = migration.slice(0, previousStart).trimEnd();
migration += `\n--> statement-breakpoint\n${statements.join("\n")}\n`;
fs.writeFileSync(MIGRATION_FILE, migration, "utf8");

console.log(JSON.stringify({
  curated: entries.length,
  duplicatePrompts: duplicatePrompts.length,
  mergedDuplicateEntries: collisions,
  changedHeadwords,
  migration: MIGRATION_FILE,
}, null, 2));
