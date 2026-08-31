import json
import sqlite3
import sys
from collections import Counter
from pathlib import Path


LEVELS = ("N5", "N4", "N3", "N2", "N1")
LEVEL_RANK = {level: index for index, level in enumerate(LEVELS)}
EXPECTED_EXAMPLES = (
    "学校（がっこう）",
    "学生（がくせい）",
    "大学（だいがく）",
    "学ぶ（まなぶ）",
)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    database_path = Path(sys.argv[1])
    vocab_dir = Path(sys.argv[2])
    supplement_path = Path(sys.argv[3])
    connection = sqlite3.connect(f"file:{database_path.as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row

    tables = [
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
        )
    ]
    columns = [row[1] for row in connection.execute('PRAGMA table_info("kanji")')]
    row_count = connection.execute("SELECT COUNT(*) FROM kanji").fetchone()[0]
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    valid_json_rows = connection.execute(
        "SELECT COUNT(*) FROM kanji WHERE json_valid(full_words)"
    ).fetchone()[0]
    dataset_kanji = {
        row[0] for row in connection.execute("SELECT kanji FROM kanji")
    }

    allowed_level_by_word: dict[str, str] = {}
    selected_by_level: Counter[str] = Counter()
    expected_relations: set[tuple[str, str]] = set()
    for level in LEVELS:
        entries = json.loads((vocab_dir / f"{level.lower()}.json").read_text(encoding="utf-8"))
        for entry in entries:
            matching_kanji = dataset_kanji.intersection(entry["word"])
            if not matching_kanji:
                continue
            formatted_word = f"{entry['word']}（{entry['reading']}）"
            if formatted_word in allowed_level_by_word:
                continue
            allowed_level_by_word[formatted_word] = level
            selected_by_level[level] += 1
            expected_relations.update((kanji, formatted_word) for kanji in matching_kanji)

    openjlpt_unique_words = len(allowed_level_by_word)
    supplement_data = json.loads(supplement_path.read_text(encoding="utf-8"))
    supplemental_words: set[str] = set()
    supplemental_surfaces: set[str] = set()
    for entry in supplement_data["entries"]:
        word = entry["word"]
        reading = entry["reading"]
        matching_kanji = dataset_kanji.intersection(word)
        formatted_word = f"{word}（{reading}）"
        supplemental_words.add(formatted_word)
        supplemental_surfaces.add(word)
        if formatted_word not in allowed_level_by_word:
            allowed_level_by_word[formatted_word] = "supplement"
            expected_relations.update(
                (kanji, formatted_word) for kanji in matching_kanji
            )

    actual_relations: set[tuple[str, str]] = set()
    duplicate_rows = 0
    malformed_words = 0
    invalid_relations = 0
    ordering_violations = 0
    zero_kanji: list[str] = []
    gaku_words: set[str] = set()
    for row in connection.execute("SELECT kanji, full_words FROM kanji ORDER BY id"):
        words = json.loads(row["full_words"])
        if not words:
            zero_kanji.append(row["kanji"])
        if len(words) != len(set(words)):
            duplicate_rows += 1

        previous_rank = -1
        for word in words:
            if "（" not in word or not word.endswith("）"):
                malformed_words += 1
                continue
            spelling = word.rsplit("（", 1)[0]
            if row["kanji"] not in spelling:
                invalid_relations += 1
            level = allowed_level_by_word.get(word)
            if level is None:
                invalid_relations += 1
                continue
            rank = LEVEL_RANK.get(level, len(LEVELS))
            if rank < previous_rank:
                ordering_violations += 1
            previous_rank = rank
            actual_relations.add((row["kanji"], word))
            if row["kanji"] == "学":
                gaku_words.add(word)

    example_presence = {word: word in gaku_words for word in EXPECTED_EXAMPLES}
    missing_relations = expected_relations - actual_relations
    extra_relations = actual_relations - expected_relations
    actual_unique_words = {word for _, word in actual_relations}

    report = {
        "database": str(database_path),
        "file_size_bytes": database_path.stat().st_size,
        "tables": tables,
        "kanji_columns": columns,
        "kanji_rows": row_count,
        "integrity_check": integrity,
        "valid_json_rows": valid_json_rows,
        "rows_with_duplicate_words": duplicate_rows,
        "malformed_words": malformed_words,
        "invalid_relations": invalid_relations,
        "level_ordering_violations": ordering_violations,
        "selected_words_by_level": {level: selected_by_level[level] for level in LEVELS},
        "openjlpt_unique_words": openjlpt_unique_words,
        "supplemental_unique_entries": len(supplemental_words),
        "supplemental_unique_surfaces": len(supplemental_surfaces),
        "total_unique_words": len(actual_unique_words),
        "total_relations": len(actual_relations),
        "missing_expected_relations": len(missing_relations),
        "extra_relations": len(extra_relations),
        "kanji_with_zero_words": zero_kanji,
        "expected_examples_for_学": example_presence,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))

    if integrity != "ok":
        raise SystemExit("integrity_check falhou")
    if row_count != 1006 or valid_json_rows != 1006:
        raise SystemExit("contagem de linhas ou JSON válido divergente")
    if duplicate_rows or malformed_words or invalid_relations or ordering_violations:
        raise SystemExit("a auditoria das relações falhou")
    if missing_relations or extra_relations:
        raise SystemExit("o banco diverge da whitelist OpenJLPT")
    if not all(example_presence.values()):
        raise SystemExit("um ou mais exemplos esperados não foram encontrados")
    if zero_kanji:
        raise SystemExit(f"ainda existem kanjis sem vocabulário: {zero_kanji}")


if __name__ == "__main__":
    main()
