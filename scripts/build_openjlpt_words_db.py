import argparse
import hashlib
import json
import shutil
import sqlite3
import sys
import time
from collections import Counter
from pathlib import Path


LEVELS = ("N5", "N4", "N3", "N2", "N1")
OPENJLPT_REPOSITORY = "https://github.com/evanclan/OpenJLPT"
OPENJLPT_LICENSE = "CC BY-SA 4.0"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def table_fingerprint(connection: sqlite3.Connection, table: str, columns: list[str]) -> str:
    digest = hashlib.sha256()
    quoted_columns = ", ".join(f'"{column}"' for column in columns)
    order_by = '"id"' if "id" in columns else ", ".join(f'"{column}"' for column in columns)
    for row in connection.execute(
        f'SELECT {quoted_columns} FROM "{table}" ORDER BY {order_by}'
    ):
        payload = json.dumps(tuple(row), ensure_ascii=False, separators=(",", ":"))
        digest.update(payload.encode("utf-8"))
        digest.update(b"\n")
    return digest.hexdigest()


def build(
    source: Path,
    output: Path,
    vocab_dir: Path,
    supplement: Path,
    report: Path,
    openjlpt_commit: str,
) -> None:
    started_at = time.monotonic()
    source_hash = sha256_file(source)
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, output)

    connection = sqlite3.connect(output)
    connection.row_factory = sqlite3.Row
    table_names = {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )
    }
    if "kanji" not in table_names:
        raise RuntimeError("A tabela 'kanji' não existe no banco de origem")

    kanji_columns = [row[1] for row in connection.execute('PRAGMA table_info("kanji")')]
    if "full_words" in kanji_columns:
        raise RuntimeError("O banco de origem já contém a coluna full_words")

    kanji_rows = connection.execute(
        'SELECT id, kanji FROM "kanji" ORDER BY id'
    ).fetchall()
    if len(kanji_rows) != 1006:
        raise RuntimeError(f"Esperados 1006 kanjis; encontrados {len(kanji_rows)}")
    dataset_kanji = {row["kanji"] for row in kanji_rows}
    if len(dataset_kanji) != 1006:
        raise RuntimeError("A coluna kanji não contém 1006 valores únicos")

    protected_fingerprints: dict[str, str] = {
        "kanji": table_fingerprint(connection, "kanji", kanji_columns)
    }
    metadata_columns: list[str] = []
    if "metadata" in table_names:
        metadata_columns = [
            row[1] for row in connection.execute('PRAGMA table_info("metadata")')
        ]
        protected_fingerprints["metadata"] = table_fingerprint(
            connection, "metadata", metadata_columns
        )

    words_by_kanji: dict[str, dict[str, None]] = {
        kanji: {} for kanji in dataset_kanji
    }
    selected_level_by_word: dict[str, str] = {}
    source_counts_by_level: dict[str, int] = {}
    selected_words_by_level: Counter[str] = Counter()
    relations_by_level: Counter[str] = Counter()
    blank_readings: list[dict[str, str]] = []
    invalid_level_entries: list[dict[str, str]] = []

    for level in LEVELS:
        level_path = vocab_dir / f"{level.lower()}.json"
        entries = json.loads(level_path.read_text(encoding="utf-8"))
        source_counts_by_level[level] = len(entries)

        for entry in entries:
            word = entry.get("word", "")
            reading = entry.get("reading", "")
            declared_level = entry.get("level", "")
            if declared_level != level:
                invalid_level_entries.append(
                    {"file_level": level, "declared_level": declared_level, "word": word}
                )
                continue

            matching_kanji = dataset_kanji.intersection(word)
            if not matching_kanji:
                continue
            if not reading:
                blank_readings.append({"level": level, "word": word})
                continue

            formatted_word = f"{word}（{reading}）"
            if formatted_word in selected_level_by_word:
                continue

            selected_level_by_word[formatted_word] = level
            selected_words_by_level[level] += 1
            for kanji in matching_kanji:
                words_by_kanji[kanji][formatted_word] = None
                relations_by_level[level] += 1

    if invalid_level_entries:
        raise RuntimeError(f"Entradas com nível divergente: {invalid_level_entries[:10]}")
    if blank_readings:
        raise RuntimeError(f"Palavras selecionadas sem leitura: {blank_readings[:10]}")

    openjlpt_unique_words_total = len(selected_level_by_word)
    supplement_data = json.loads(supplement.read_text(encoding="utf-8"))
    supplement_entries = supplement_data.get("entries", [])
    supplement_words: dict[str, None] = {}
    supplement_surfaces: set[str] = set()
    supplement_relations = 0
    supplement_duplicates: list[str] = []

    for entry in supplement_entries:
        word = entry.get("word", "").strip()
        reading = entry.get("reading", "").strip()
        if not word or not reading:
            raise RuntimeError(f"Entrada suplementar incompleta: {entry}")

        matching_kanji = dataset_kanji.intersection(word)
        if not matching_kanji:
            raise RuntimeError(f"Entrada suplementar não usa nenhum kanji do dataset: {word}")

        formatted_word = f"{word}（{reading}）"
        if formatted_word in supplement_words:
            supplement_duplicates.append(formatted_word)
            continue

        supplement_words[formatted_word] = None
        supplement_surfaces.add(word)
        if formatted_word in selected_level_by_word:
            continue

        selected_level_by_word[formatted_word] = "supplement"
        for kanji in matching_kanji:
            if formatted_word not in words_by_kanji[kanji]:
                words_by_kanji[kanji][formatted_word] = None
                supplement_relations += 1

    if supplement_duplicates:
        raise RuntimeError(
            f"Entradas suplementares duplicadas: {supplement_duplicates[:10]}"
        )

    connection.execute(
        "ALTER TABLE kanji ADD COLUMN full_words TEXT NOT NULL DEFAULT '[]'"
    )
    counts_by_kanji: dict[str, int] = {}
    for row in kanji_rows:
        kanji = row["kanji"]
        words = list(words_by_kanji[kanji])
        counts_by_kanji[kanji] = len(words)
        connection.execute(
            "UPDATE kanji SET full_words = ? WHERE id = ?",
            (json.dumps(words, ensure_ascii=False, separators=(",", ":")), row["id"]),
        )
    connection.commit()

    if table_fingerprint(connection, "kanji", kanji_columns) != protected_fingerprints["kanji"]:
        raise RuntimeError("Um ou mais campos preexistentes da tabela kanji foram alterados")
    if "metadata" in protected_fingerprints:
        if (
            table_fingerprint(connection, "metadata", metadata_columns)
            != protected_fingerprints["metadata"]
        ):
            raise RuntimeError("A tabela metadata foi alterada")

    integrity_check = connection.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity_check != "ok":
        raise RuntimeError(f"PRAGMA integrity_check falhou: {integrity_check}")

    total_relations = 0
    for row in connection.execute("SELECT kanji, full_words FROM kanji ORDER BY id"):
        words = json.loads(row["full_words"])
        if not isinstance(words, list):
            raise RuntimeError(f"full_words de {row['kanji']} não é um array JSON")
        if len(words) != len(set(words)):
            raise RuntimeError(f"full_words de {row['kanji']} contém duplicatas")
        if any(row["kanji"] not in word.rsplit("（", 1)[0] for word in words):
            raise RuntimeError(f"full_words de {row['kanji']} contém relação inválida")
        total_relations += len(words)

    expected_relations = sum(len(words) for words in words_by_kanji.values())
    if total_relations != expected_relations:
        raise RuntimeError(
            f"Relações gravadas ({total_relations}) divergem das extraídas ({expected_relations})"
        )

    empty_kanji = [kanji for kanji, count in counts_by_kanji.items() if count == 0]
    connection.close()

    report_data = {
        "dictionary": "OpenJLPT",
        "source_repository": OPENJLPT_REPOSITORY,
        "source_commit": openjlpt_commit,
        "license": OPENJLPT_LICENSE,
        "translations_imported": False,
        "source_database": str(source),
        "output_database": str(output),
        "source_database_sha256": source_hash,
        "output_database_sha256": sha256_file(output),
        "source_entries_by_level": source_counts_by_level,
        "source_entries_total": sum(source_counts_by_level.values()),
        "selected_unique_words_by_level": {
            level: selected_words_by_level[level] for level in LEVELS
        },
        "openjlpt_selected_unique_words_total": openjlpt_unique_words_total,
        "supplemental_unique_entries_total": len(supplement_words),
        "supplemental_unique_surfaces_total": len(supplement_surfaces),
        "supplemental_kanji_word_relations": supplement_relations,
        "supplemental_source_file": str(supplement),
        "supplemental_sources": supplement_data.get("sources", []),
        "selected_unique_words_total": len(selected_level_by_word),
        "kanji_word_relations_by_level": {
            level: relations_by_level[level] for level in LEVELS
        },
        "total_kanji_word_relations": total_relations,
        "kanji_count": len(kanji_rows),
        "average_words_per_kanji": total_relations / len(kanji_rows),
        "kanji_with_zero_words": sorted(empty_kanji),
        "integrity_check": integrity_check,
        "existing_fields_preserved": True,
        "final_tables": sorted(table_names),
        "elapsed_seconds": time.monotonic() - started_at,
    }
    report.write_text(
        json.dumps(report_data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report_data, ensure_ascii=False, indent=2), flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--vocab-dir", type=Path, required=True)
    parser.add_argument("--supplement", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--openjlpt-commit", required=True)
    return parser.parse_args()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    arguments = parse_args()
    build(
        source=arguments.source,
        output=arguments.output,
        vocab_dir=arguments.vocab_dir,
        supplement=arguments.supplement,
        report=arguments.report,
        openjlpt_commit=arguments.openjlpt_commit,
    )
