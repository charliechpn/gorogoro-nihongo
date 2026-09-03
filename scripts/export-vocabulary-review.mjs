import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const level = process.argv[2] ?? "N5";
const offset = Number(process.argv[3] ?? 0);
const limit = Number(process.argv[4] ?? 100);
const format = process.argv[5] ?? "json";

if (!/^N[1-5]$/.test(level) || !Number.isInteger(offset) || !Number.isInteger(limit)) {
  throw new Error("Uso: node scripts/export-vocabulary-review.mjs N5 0 100");
}

const database = new DatabaseSync(":memory:");
for (const file of fs.readdirSync("drizzle").filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
  database.exec(
    fs.readFileSync(path.join("drizzle", file), "utf8").replaceAll("--> statement-breakpoint", ""),
  );
}

const easierLevelKeys = new Set(
  fs.readdirSync(path.join("content", "vocabulary"))
    .filter((file) => /^n[1-5]\.pt\.json$/i.test(file))
    .flatMap((file) => {
      try {
        return [JSON.parse(fs.readFileSync(path.join("content", "vocabulary", file), "utf8"))];
      } catch {
        return [];
      }
    })
    .filter((curation) => Number(curation.level.slice(1)) > Number(level.slice(1)))
    .flatMap((curation) => curation.entries.map(([, word, reading]) => `${word}\u0000${reading}`)),
);

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
  `)
  .all(level)
  .filter((entry) => !easierLevelKeys.has(`${entry.word}\u0000${entry.reading}`))
  .slice(offset, offset + limit)
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
