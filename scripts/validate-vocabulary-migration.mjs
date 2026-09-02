import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const migrationFiles = fs
  .readdirSync("drizzle")
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .sort()
  .map((file) => `drizzle/${file}`);

const database = new DatabaseSync(":memory:");

for (const file of migrationFiles) {
  const migration = fs
    .readFileSync(file, "utf8")
    .replaceAll("--> statement-breakpoint", "");
  database.exec(migration);
}

const count = database.prepare("select count(*) as count from vocabulary_catalog").get();
const levels = database
  .prepare(
    "select jlpt_level as level, count(*) as count from vocabulary_catalog group by jlpt_level order by jlpt_level desc",
  )
  .all();
const samples = database
  .prepare(
    "select word, reading, meanings_pt_json as meaningsPt from vocabulary_catalog where word in (?, ?, ?, ?) order by word",
  )
  .all("お皿", "お見舞い", "いい加減", "お代わり");
const integrity = database.prepare("pragma integrity_check").get();
const curation = database
  .prepare(`
    select
      count(*) as catalogCount,
      count(prompt_pt) as promptCount,
      count(distinct prompt_pt) as uniquePromptCount
    from vocabulary_catalog
    where jlpt_level = 'N5'
  `)
  .get();

console.log(JSON.stringify({ count, levels, samples, curation, integrity }, null, 2));
