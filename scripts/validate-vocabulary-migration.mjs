import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const migrationFiles = [
  "drizzle/0000_perpetual_stark_industries.sql",
  "drizzle/0001_violet_brood.sql",
];

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

console.log(JSON.stringify({ count, levels, samples, integrity }, null, 2));
