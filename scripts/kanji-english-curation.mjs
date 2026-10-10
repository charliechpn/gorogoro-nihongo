import fs from 'node:fs';
import path from 'node:path';

const directory = path.join('content', 'kanji', 'en');
const schema = ['id', 'kanji', 'meaningPt', 'meaningEn'];

export function loadKanjiEnglishCurations(rows) {
  const sourceById = new Map(rows.map((row) => [Number(row.id), row]));
  const translations = new Map();
  const files = fs.readdirSync(directory).filter((name) => name.endsWith('.json')).sort();
  if (files.length === 0) throw new Error(`No English kanji curation files in ${directory}.`);

  for (const file of files) {
    const document = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
    if (document.version !== 1 || JSON.stringify(document.schema) !== JSON.stringify(schema)) {
      throw new Error(`Invalid curation format: ${file}.`);
    }
    const [firstId, lastId] = document.range ?? [];
    if (!Number.isInteger(firstId) || !Number.isInteger(lastId) || lastId < firstId
      || document.entries?.length !== lastId - firstId + 1) {
      throw new Error(`Invalid or incomplete ID range in ${file}.`);
    }

    for (const [index, entry] of document.entries.entries()) {
      if (!Array.isArray(entry) || entry.length !== schema.length) {
        throw new Error(`Invalid entry at index ${index} in ${file}.`);
      }
      const [id, kanji, meaningPt, meaningEn] = entry;
      const source = sourceById.get(id);
      const sourceKanji = source?.kanji ?? source?.character;
      const sourceMeaningPt = source?.meaning ?? source?.meaning_pt;
      if (id !== firstId + index || sourceKanji !== kanji || sourceMeaningPt !== meaningPt) {
        throw new Error(`Source mismatch for kanji ID ${id} in ${file}.`);
      }
      if (typeof meaningEn !== 'string' || !meaningEn.trim() || meaningEn !== meaningEn.trim()) {
        throw new Error(`Missing or untrimmed English meaning for kanji ID ${id} in ${file}.`);
      }
      if (translations.has(id)) throw new Error(`Duplicate English translation for kanji ID ${id}.`);
      translations.set(id, { id, kanji, meaningPt, meaningEn });
    }

    for (const id of Object.keys(document.notes ?? {})) {
      if (!translations.has(Number(id))) throw new Error(`Note for unknown kanji ID ${id} in ${file}.`);
    }
  }

  return translations;
}
