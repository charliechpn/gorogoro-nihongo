import json
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path


LEVELS = ("N5", "N4", "N3", "N2", "N1")
CJK_CHARACTER = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    vocab_dir = Path(sys.argv[1])
    database_path = Path(sys.argv[2])
    connection = sqlite3.connect(f"file:{database_path.as_posix()}?mode=ro", uri=True)
    dataset_kanji = {
        row[0] for row in connection.execute("SELECT kanji FROM kanji")
    }
    connection.close()

    counts: dict[str, int] = {}
    pair_levels: dict[tuple[str, str], set[str]] = defaultdict(set)
    word_readings: dict[str, set[str]] = defaultdict(set)
    matched_pairs: set[tuple[str, str]] = set()
    matched_by_level: Counter[str] = Counter()
    excluded_kana_or_non_kanji_by_level: Counter[str] = Counter()
    excluded_outside_dataset_by_level: Counter[str] = Counter()
    matched_blank_reading: list[tuple[str, str]] = []
    entries_with_any_dataset_kanji = 0

    for level in LEVELS:
        entries = json.loads((vocab_dir / f"{level.lower()}.json").read_text(encoding="utf-8"))
        counts[level] = len(entries)
        for entry in entries:
            word = entry["word"]
            reading = entry["reading"]
            declared_level = entry["level"]
            if declared_level != level:
                raise RuntimeError(f"Nível divergente: {declared_level} em {level}")
            pair = (word, reading)
            pair_levels[pair].add(level)
            word_readings[word].add(reading)
            if dataset_kanji.intersection(word):
                entries_with_any_dataset_kanji += 1
                matched_pairs.add(pair)
                matched_by_level[level] += 1
                if not reading:
                    matched_blank_reading.append((level, word))
            elif CJK_CHARACTER.search(word):
                excluded_outside_dataset_by_level[level] += 1
            else:
                excluded_kana_or_non_kanji_by_level[level] += 1

    cross_level_duplicates = {
        f"{word}（{reading}）": sorted(levels)
        for (word, reading), levels in pair_levels.items()
        if len(levels) > 1
    }
    multiple_readings = {
        word: sorted(readings)
        for word, readings in word_readings.items()
        if len(readings) > 1
    }
    result = {
        "counts_by_level": counts,
        "total_entries": sum(counts.values()),
        "unique_word_reading_pairs": len(pair_levels),
        "cross_level_exact_duplicates": len(cross_level_duplicates),
        "cross_level_duplicate_samples": dict(list(cross_level_duplicates.items())[:20]),
        "words_with_multiple_readings": len(multiple_readings),
        "multiple_reading_samples": dict(list(multiple_readings.items())[:20]),
        "matched_entries_by_level": dict(matched_by_level),
        "excluded_kana_or_non_kanji_by_level": dict(excluded_kana_or_non_kanji_by_level),
        "excluded_outside_1006_kanji_by_level": dict(excluded_outside_dataset_by_level),
        "excluded_kana_or_non_kanji_total": sum(excluded_kana_or_non_kanji_by_level.values()),
        "excluded_outside_1006_kanji_total": sum(excluded_outside_dataset_by_level.values()),
        "matched_entries_before_exact_deduplication": entries_with_any_dataset_kanji,
        "matched_unique_word_reading_pairs": len(matched_pairs),
        "matched_entries_with_blank_reading": matched_blank_reading,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
