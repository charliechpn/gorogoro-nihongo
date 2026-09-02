#!/usr/bin/env python3
"""Build and validate the vocabulary catalog seed used by the local trainer."""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from collections import Counter
from pathlib import Path


LEVELS = ("N5", "N4", "N3", "N2", "N1")
CORRUPT_GLOSSES = {"#NAME?", "+-", "3", "r", "t"}
ENUMERATION_RE = re.compile(r"^\s*\d+\.\s+")
PARENTHETICAL_ENUMERATION_RE = re.compile(r"^\s*\(\d+\)\s+")
MORPHOLOGY_TAG_RE = re.compile(
    r"^\((?:v\d\w*|vi|vt|adj-\w+|n|adv|aux|exp)(?:;\s*(?:v\d\w*|vi|vt|adj-\w+|n|adv|aux|exp))*\)\s*",
    re.IGNORECASE,
)
USAGE_TAGS = {
    "(abbr)": "abreviação:",
    "(col)": "coloquial:",
    "(hon)": "forma honorífica:",
    "(honorable)": "forma honorífica:",
    "(hum)": "forma humilde:",
    "(humble)": "forma humilde:",
    "(male)": "uso masculino:",
    "(polite)": "forma polida:",
    "(respectful)": "forma respeitosa:",
    "(sl)": "gíria:",
    "(vulg)": "vulgar:",
}
ENTRY_OVERRIDES = {
    ("お金持ち", "かねもち/おかねもち"): ["pessoa rica"],
    ("お見舞い", "おみまい"): ["visita a uma pessoa doente", "votos de melhoras"],
    ("お帰り", "おかえり"): ["bem-vindo de volta", "retorno"],
    ("お兄さん", "おにいさん"): ["irmão mais velho (forma honorífica)"],
    ("お皿", "おさら"): ["prato"],
    ("お姉さん", "おねえさん"): ["irmã mais velha (forma honorífica)"],
    ("お祝い", "おいわい"): ["celebração", "felicitações"],
    ("お参り", "おまいり"): ["visita a um templo ou santuário", "oração"],
    ("お代わり", "おかわり"): ["segunda porção", "repetição"],
    ("いい加減", "いいかげん"): ["irresponsável", "descuidado", "vago", "moderado", "adequado"],
    ("お蔭様で", "おかげさまで"): ["graças a você", "felizmente"],
    ("お休み", "おやすみ"): ["descanso", "folga", "ausência", "boa noite"],
    ("ヶ月", "かげつ"): ["contador de meses"],
    ("歳", "さい"): ["anos de idade"],
    ("畳", "じょう"): ["contador de tatames"],
}
SEED_START = "-- VOCABULARY_CATALOG_SEED_V1"
SEED_END = "-- END_VOCABULARY_CATALOG_SEED_V1"


def clean_meaning(raw_value: object) -> str:
    value = " ".join(str(raw_value).split())
    value = ENUMERATION_RE.sub("", value)
    value = PARENTHETICAL_ENUMERATION_RE.sub("", value)
    value = MORPHOLOGY_TAG_RE.sub("", value)
    labels: list[str] = []
    while True:
        lowered = value.lower()
        matched = next((tag for tag in USAGE_TAGS if lowered.startswith(tag)), None)
        if matched is None:
            break
        labels.append(USAGE_TAGS[matched])
        value = value[len(matched):].strip()
    return " ".join([*labels, value]).strip()


def repaired_meanings(values: list[object]) -> list[str]:
    repaired: list[str] = []
    pending = ""
    depth = 0

    for raw_value in values:
        value = clean_meaning(raw_value)
        if value in CORRUPT_GLOSSES:
            continue
        if pending:
            pending = f"{pending}, {value}"
            depth += value.count("(") - value.count(")")
            if depth <= 0:
                repaired.append(pending)
                pending = ""
                depth = 0
            continue

        depth = value.count("(") - value.count(")")
        if depth > 0:
            pending = value
        else:
            repaired.append(value)
            depth = 0

    if pending:
        repaired.append(pending)
    return repaired


def selected_entries(vocab_dir: Path, database: Path) -> list[dict[str, object]]:
    connection = sqlite3.connect(f"file:{database.resolve().as_posix()}?mode=ro", uri=True)
    try:
        allowed = {
            word
            for (words_json,) in connection.execute("SELECT full_words FROM kanji")
            for word in json.loads(words_json)
        }
    finally:
        connection.close()

    selected: list[dict[str, object]] = []
    seen: set[tuple[str, str]] = set()
    for level in LEVELS:
        entries = json.loads((vocab_dir / f"{level.lower()}.json").read_text(encoding="utf-8"))
        for entry in entries:
            word = str(entry["word"]).strip()
            reading = str(entry["reading"]).strip()
            if not reading or f"{word}（{reading}）" not in allowed:
                continue
            key = (word, reading)
            if key in seen:
                continue
            seen.add(key)
            selected.append(entry)
    return selected


def normalize_translation(value: str, source: str) -> str:
    normalized = " ".join(value.split()).strip(" ;")
    if source.lower().startswith("to be ") and normalized.lower().startswith("a ser "):
        normalized = "estar " + normalized[6:]
    elif source.lower().startswith("to ") and normalized.lower().startswith("para "):
        normalized = normalized[5:]
    if (
        source
        and source[0].islower()
        and normalized
        and normalized[0].isupper()
        and not normalized.isupper()
    ):
        normalized = normalized[0].lower() + normalized[1:]
    return normalized


def sql_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def build_seed(records: list[dict[str, object]], chunk_size: int = 200) -> str:
    lines = [SEED_START]
    for offset in range(0, len(records), chunk_size):
        chunk = records[offset : offset + chunk_size]
        lines.extend(
            [
                "INSERT INTO `vocabulary_catalog`",
                "(`id`, `word`, `reading`, `meanings_pt_json`, `meanings_en_json`, `jlpt_level`)",
                "VALUES",
            ]
        )
        values = []
        for record in chunk:
            values.append(
                "(" + ", ".join(
                    [
                        str(record["id"]),
                        sql_string(str(record["word"])),
                        sql_string(str(record["reading"])),
                        sql_string(json.dumps(record["meaningsPt"], ensure_ascii=False, separators=(",", ":"))),
                        sql_string(json.dumps(record["meaningsEn"], ensure_ascii=False, separators=(",", ":"))),
                        sql_string(str(record["jlpt"])),
                    ]
                ) + ")"
            )
        lines.append(",\n".join(values) + ";")
        lines.append("--> statement-breakpoint")

    lines.extend(
        [
            "CREATE TRIGGER `trg_validate_vocabulary_answer`",
            "BEFORE INSERT ON `vocabulary_practice_answers`",
            "FOR EACH ROW",
            "WHEN NOT EXISTS (",
            "\tSELECT 1",
            "\tFROM `vocabulary_practice_sessions` AS session",
            "\tWHERE session.id = NEW.session_id",
            "\t  AND session.learner_id = NEW.learner_id",
            "\t  AND session.direction = NEW.direction",
            "\t  AND session.status = 'active'",
            "\t  AND session.turn = NEW.turn",
            "\t  AND session.current_vocabulary_id = NEW.vocabulary_id",
            ")",
            "BEGIN",
            "\tSELECT RAISE(ABORT, 'stale_vocabulary_answer');",
            "END;",
            "--> statement-breakpoint",
            "PRAGMA optimize;",
            SEED_END,
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database",
        type=Path,
        default=Path("artifacts/kanji database 1 - openjlpt-onomatopoeia-transitivity.db"),
    )
    parser.add_argument(
        "--vocab-dir",
        type=Path,
        default=Path("data/openjlpt/data/json/vocab"),
    )
    parser.add_argument(
        "--cache",
        type=Path,
        default=Path("data/vocabulary-google-translation-cache.json"),
    )
    parser.add_argument(
        "--migration",
        type=Path,
        default=Path("drizzle/0001_violet_brood.sql"),
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("data/vocabulary-training-report.json"),
    )
    args = parser.parse_args()

    cache = json.loads(args.cache.read_text(encoding="utf-8"))
    source_entries = selected_entries(args.vocab_dir, args.database)
    records: list[dict[str, object]] = []
    missing: list[str] = []
    counts: Counter[str] = Counter()

    for entry_id, entry in enumerate(source_entries, start=1):
        word = str(entry["word"]).strip()
        reading = str(entry["reading"]).strip()
        level = str(entry["level"])
        meanings_en = repaired_meanings(entry["meanings"])
        meanings_pt = ENTRY_OVERRIDES.get((word, reading))

        if meanings_pt is None:
            translated: list[str] = []
            seen_translations: set[str] = set()
            for meaning in meanings_en:
                cache_key = f"en->pt\n{meaning}"
                if cache_key not in cache:
                    missing.append(meaning)
                    continue
                value = normalize_translation(str(cache[cache_key]), meaning)
                comparison_key = value.casefold()
                if value and comparison_key not in seen_translations:
                    seen_translations.add(comparison_key)
                    translated.append(value)
            meanings_pt = translated

        if not meanings_pt:
            raise RuntimeError(f"Nenhuma tradução portuguesa para {word}（{reading}）")
        if any("ZXQ" in meaning for meaning in meanings_pt):
            raise RuntimeError(f"Marcador de lote vazou para {word}（{reading}）")

        counts[level] += 1
        records.append(
            {
                "id": entry_id,
                "word": word,
                "reading": reading,
                "meaningsPt": meanings_pt,
                "meaningsEn": meanings_en,
                "jlpt": level,
            }
        )

    if missing:
        unique_missing = sorted(set(missing))
        raise RuntimeError(f"Faltam {len(unique_missing)} traduções: {unique_missing[:10]}")
    if len(records) != 6029:
        raise RuntimeError(f"Esperadas 6029 palavras; encontradas {len(records)}")
    if len({(record["word"], record["reading"]) for record in records}) != len(records):
        raise RuntimeError("O catálogo final contém pares palavra/leitura duplicados")

    migration = args.migration.read_text(encoding="utf-8")
    if SEED_START in migration:
        migration = migration.split(SEED_START, 1)[0].rstrip() + "\n"
    migration += "--> statement-breakpoint\n" + build_seed(records)
    args.migration.write_text(migration, encoding="utf-8")

    report = {
        "source": "OpenJLPT",
        "selected_unique_words": len(records),
        "counts_by_level": {level: counts[level] for level in LEVELS},
        "translated_meanings": sum(len(record["meaningsPt"]) for record in records),
        "manual_repairs": [f"{word}（{reading}）" for word, reading in ENTRY_OVERRIDES],
        "corrupt_source_glosses_removed": sorted(CORRUPT_GLOSSES),
        "samples": {
            level: [
                {
                    "word": record["word"],
                    "reading": record["reading"],
                    "meaningsPt": record["meaningsPt"],
                }
                for record in records
                if record["jlpt"] == level
            ][:5]
            for level in LEVELS
        },
    }
    args.report.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
