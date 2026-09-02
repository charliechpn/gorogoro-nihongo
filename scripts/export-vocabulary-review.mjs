import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const level = process.argv[2] ?? "N5";
const offset = Number(process.argv[3] ?? 0);
const limit = Number(process.argv[4] ?? 100);
const format = process.argv[5] ?? "json";

if (!/^N[1-5]$/.test(level) || !Number.isInteger(offset) || !Number.isInteger(limit)) {
  throw new Error("Uso: node scripts/export-vocabulary-review.mjs N5 0 100");
}

const database = new DatabaseSync(":memory:");
for (const file of [
  "drizzle/0000_perpetual_stark_industries.sql",
  "drizzle/0001_violet_brood.sql",
]) {
  database.exec(
    fs.readFileSync(file, "utf8").replaceAll("--> statement-breakpoint", ""),
  );
}

const entries = database
  .prepare(`
    SELECT
      id,
      word,
      reading,
      meanings_en_json AS meaningsEn
    FROM vocabulary_catalog
    WHERE jlpt_level = ?
    ORDER BY id
    LIMIT ? OFFSET ?
  `)
  .all(level, limit, offset)
  .map((entry) => ({
    ...entry,
    meaningsEn: JSON.parse(entry.meaningsEn),
  }));

if (format === "tsv") {
  for (const entry of entries) {
    console.log(`${entry.id}\t${entry.word}\t${entry.reading}\t${entry.meaningsEn.join(" | ")}`);
  }
} else {
  console.log(JSON.stringify(entries, null, 2));
}
