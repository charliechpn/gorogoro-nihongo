#!/usr/bin/env python3
"""Audit the transitivity SQLite artifact without mutating either database."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
from collections import Counter
from pathlib import Path


EXPECTED_TABLES = {"kanji", "metadata", "onomatopoeia", "transitivity_verbs"}
EXPECTED_CLASS_COUNTS = {"transitive": 804, "intransitive": 555, "depends": 39}
EXPECTED_LEVEL_COUNTS = {"N5": 103, "N4": 178, "N3": 230, "N2": 378, "N1": 509}
JAPANESE_RE = re.compile(r"[\u3040-\u30ff\u3400-\u9fff]")
LONG_LATIN_RE = re.compile(r"[A-Za-z]{4,}")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def connect_read_only(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def table_rows(connection: sqlite3.Connection, table: str) -> list[tuple]:
    columns = [row[1] for row in connection.execute(f"PRAGMA table_info({table})")]
    order = "id" if "id" in columns else columns[0]
    return [tuple(row) for row in connection.execute(f"SELECT * FROM {table} ORDER BY {order}")]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--target", required=True, type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()

    source = args.source.resolve()
    target = args.target.resolve()
    failures: list[str] = []
    warnings: list[str] = []

    if not source.is_file():
        failures.append(f"Source database does not exist: {source}")
    if not target.is_file():
        failures.append(f"Target database does not exist: {target}")
    if failures:
        print(json.dumps({"status": "failed", "failures": failures}, ensure_ascii=False, indent=2))
        return 1

    with connect_read_only(source) as src, connect_read_only(target) as dst:
        source_integrity = src.execute("PRAGMA integrity_check").fetchone()[0]
        target_integrity = dst.execute("PRAGMA integrity_check").fetchone()[0]
        if source_integrity != "ok":
            failures.append(f"Source integrity_check: {source_integrity}")
        if target_integrity != "ok":
            failures.append(f"Target integrity_check: {target_integrity}")

        source_tables = {
            row[0]
            for row in src.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
        }
        target_tables = {
            row[0]
            for row in dst.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
        }
        if target_tables != EXPECTED_TABLES:
            failures.append(f"Unexpected target tables: {sorted(target_tables)}")
        if target_tables - source_tables != {"transitivity_verbs"}:
            failures.append("The target did not add exactly one table to the source schema")

        preserved_tables: dict[str, bool] = {}
        for table in sorted(source_tables - {"metadata"}):
            preserved = table_rows(src, table) == table_rows(dst, table)
            preserved_tables[table] = preserved
            if not preserved:
                failures.append(f"Existing table changed: {table}")

        source_metadata = dict(src.execute("SELECT key, value FROM metadata"))
        target_metadata = dict(dst.execute("SELECT key, value FROM metadata"))
        preserved_metadata = all(target_metadata.get(key) == value for key, value in source_metadata.items())
        if not preserved_metadata:
            failures.append("One or more pre-existing metadata values changed")

        records = [dict(row) for row in dst.execute("SELECT * FROM transitivity_verbs ORDER BY id")]
        if len(records) != 1398:
            failures.append(f"Expected 1398 records, found {len(records)}")

        class_counts = Counter(row["classification"] for row in records)
        level_counts = Counter(row["jlpt_level"] for row in records)
        if dict(class_counts) != EXPECTED_CLASS_COUNTS:
            failures.append(f"Unexpected classification counts: {dict(class_counts)}")
        if dict(level_counts) != EXPECTED_LEVEL_COUNTS:
            failures.append(f"Unexpected JLPT counts: {dict(level_counts)}")

        blank_fields = Counter()
        invalid_json = Counter()
        invalid_examples: list[str] = []
        untranslated_pt: list[str] = []
        example_count = 0
        pt_variant_hits = Counter()
        pt_br_review_samples: list[dict[str, str]] = []
        pt_variant_patterns = {
            "tens/tenhas": re.compile(r"\b(?:tens|tenhas|tiveres)\b", re.IGNORECASE),
            "rapariga": re.compile(r"\brapariga(?:s)?\b", re.IGNORECASE),
            "está a + infinitivo": re.compile(r"\best(?:ou|á|amos|ão|ava|avam)\s+a\s+\w+[rR]\b", re.IGNORECASE),
            "tu/teu/tua": re.compile(r"\b(?:tu|teu|tua|teus|tuas|contigo|convosco)\b", re.IGNORECASE),
            "facto/contacto/tecto": re.compile(r"\b(?:facto|factos|contacto|contactos|tecto|tectos)\b", re.IGNORECASE),
            "vocabulário pt-PT": re.compile(
                r"\b(?:autocarro|autocarros|comboio|comboios|telemóvel|telemóveis|"
                r"equipa|equipas|projecto|projectos|direcção|direcções|acção|"
                r"acções|camisola|camisolas|frigorífico|frigoríficos|boleia|boleias)\b",
                re.IGNORECASE,
            ),
        }

        for row in records:
            display = row["display"]
            for field in ("word", "reading", "display", "meaning_pt", "meaning_ja", "explanation_pt", "explanation_ja"):
                if not str(row[field] or "").strip():
                    blank_fields[field] += 1

            if not JAPANESE_RE.search(row["meaning_ja"]):
                warnings.append(f"Japanese meaning has no Japanese characters: {display}")
            if LONG_LATIN_RE.search(row["meaning_ja"]):
                warnings.append(f"Japanese meaning contains untranslated Latin text: {display}")

            decoded: dict[str, object] = {}
            for field in ("meanings_en", "examples", "source_data"):
                try:
                    decoded[field] = json.loads(row[field])
                except (TypeError, json.JSONDecodeError):
                    invalid_json[field] += 1

            examples = decoded.get("examples")
            meanings_en = decoded.get("meanings_en")
            if isinstance(meanings_en, list):
                joined_meaning = "; ".join(str(value) for value in meanings_en)
                if row["meaning_pt"].strip().casefold() == joined_meaning.strip().casefold():
                    untranslated_pt.append(f"{display}: meaning")
            meaning_pt = str(row["meaning_pt"])
            meaning_flags: list[str] = []
            for label, pattern in pt_variant_patterns.items():
                matches = pattern.findall(meaning_pt)
                pt_variant_hits[label] += len(matches)
                if matches:
                    meaning_flags.append(label)
            if meaning_flags:
                pt_br_review_samples.append(
                    {
                        "display": display,
                        "en": joined_meaning if isinstance(meanings_en, list) else "",
                        "pt": meaning_pt,
                        "flags": ", ".join(meaning_flags),
                    }
                )
            if not isinstance(examples, list):
                invalid_examples.append(f"{display}: examples is not an array")
                continue

            example_count += len(examples)
            roles = Counter()
            for example in examples:
                if not isinstance(example, dict):
                    invalid_examples.append(f"{display}: example is not an object")
                    continue
                role = example.get("role")
                roles[role] += 1
                required = ("ja", "en", "pt", "source", "selection_method")
                missing = [field for field in required if not str(example.get(field, "")).strip()]
                if missing:
                    invalid_examples.append(f"{display}: example missing {', '.join(missing)}")
                if not JAPANESE_RE.search(str(example.get("ja", ""))):
                    invalid_examples.append(f"{display}: Japanese example has no Japanese characters")
                portuguese = str(example.get("pt", ""))
                if portuguese.strip().casefold() == str(example.get("en", "")).strip().casefold():
                    untranslated_pt.append(f"{display}: example")
                matched_labels: list[str] = []
                for label, pattern in pt_variant_patterns.items():
                    matches = pattern.findall(portuguese)
                    pt_variant_hits[label] += len(matches)
                    if matches:
                        matched_labels.append(label)
                if matched_labels:
                    pt_br_review_samples.append(
                        {
                            "display": display,
                            "en": str(example.get("en", "")),
                            "pt": portuguese,
                            "flags": ", ".join(matched_labels),
                        }
                    )

            if row["classification"] == "depends":
                if roles["transitive"] < 1 or roles["intransitive"] < 1:
                    invalid_examples.append(f"{display}: depends lacks both example roles")
            elif roles[row["classification"]] < 1:
                invalid_examples.append(f"{display}: lacks an example for its classification")

        if blank_fields:
            failures.append(f"Blank required fields: {dict(blank_fields)}")
        if invalid_json:
            failures.append(f"Invalid JSON columns: {dict(invalid_json)}")
        if invalid_examples:
            failures.extend(invalid_examples[:25])
            if len(invalid_examples) > 25:
                failures.append(f"... plus {len(invalid_examples) - 25} additional example errors")
        if example_count != 1437:
            failures.append(f"Expected 1437 examples, found {example_count}")
        if untranslated_pt:
            failures.append(f"Untranslated Portuguese strings: {untranslated_pt[:25]}")

        duplicate_count = dst.execute(
            """
            SELECT COUNT(*) FROM (
                SELECT word, reading FROM transitivity_verbs
                GROUP BY word, reading HAVING COUNT(*) > 1
            )
            """
        ).fetchone()[0]
        if duplicate_count:
            failures.append(f"Duplicate word/reading pairs: {duplicate_count}")

        foreign_key_issues = len(dst.execute("PRAGMA foreign_key_check").fetchall())
        if foreign_key_issues:
            failures.append(f"Foreign-key issues: {foreign_key_issues}")

        forbidden_phrase_hits = 0
        for row in records:
            forbidden_phrase_hits += sum(
                str(value).lower().count("my ass") for value in row.values() if value is not None
            )
        if forbidden_phrase_hits:
            failures.append("Forbidden joke source text found in final database")

        index_names = {
            row[0]
            for row in dst.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='transitivity_verbs'"
            )
        }
        expected_indexes = {
            "idx_transitivity_verbs_jlpt_level",
            "idx_transitivity_verbs_classification",
            "idx_transitivity_verbs_level_classification",
        }
        missing_indexes = expected_indexes - index_names
        if missing_indexes:
            failures.append(f"Missing indexes: {sorted(missing_indexes)}")

        report = {
            "status": "passed" if not failures else "failed",
            "source_database": str(source),
            "target_database": str(target),
            "target_sha256": sha256(target),
            "integrity_check": {"source": source_integrity, "target": target_integrity},
            "tables": sorted(target_tables),
            "preserved_existing_tables": preserved_tables,
            "preserved_existing_metadata": preserved_metadata,
            "total_entries": len(records),
            "classification_counts": dict(class_counts),
            "jlpt_level_counts": dict(level_counts),
            "total_examples": example_count,
            "duplicate_word_reading_pairs": duplicate_count,
            "foreign_key_issues": foreign_key_issues,
            "json_columns_valid": not invalid_json,
            "required_fields_complete": not blank_fields,
            "example_contract_valid": not invalid_examples,
            "untranslated_portuguese_strings": len(untranslated_pt),
            "forbidden_joke_source_hits": forbidden_phrase_hits,
            "indexes": sorted(index_names),
            "pt_br_review_flags": dict(pt_variant_hits),
            "pt_br_review_samples": pt_br_review_samples,
            "warnings": warnings,
            "failures": failures,
        }

    output = json.dumps(report, ensure_ascii=False, indent=2)
    print(output)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(output + "\n", encoding="utf-8")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
