import argparse
import hashlib
import json
import re
import shutil
import sqlite3
import sys
from collections import Counter
from pathlib import Path


PT_OVERRIDES = {
    "ゴチャゴチャ": "Algo confuso, bagunçado ou desorganizado.",
    "ボンボン": "Som de explosões ou batidas repetidas; também pode indicar excesso ou grande quantidade.",
    "ウロウロ": "Andar de um lado para o outro, sem rumo ou indeciso.",
    "オロオロ": "Ficar agitado e confuso, sem saber como reagir.",
    "モゴモゴ": "Falar de modo abafado ou mastigar com a boca cheia.",
    "ピチピチ": "Saltar com energia, como um peixe; também indica algo jovem e cheio de vida.",
    "シューシュー": "Som de vapor, ar ou água escapando com força.",
    "キョロキョロ": "Olhar ao redor repetidamente, com curiosidade ou inquietação.",
    "グングン": "Avançar, crescer ou melhorar rapidamente e com força.",
    "ガラガラ": "Som de objetos duros rolando ou desabando; também descreve uma voz rouca.",
    "ズーム": "Som de algo acelerando rapidamente, como um carro ou avião.",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def table_fingerprint(connection: sqlite3.Connection, table: str) -> str:
    columns = [row[1] for row in connection.execute(f'PRAGMA table_info("{table}")')]
    digest = hashlib.sha256()
    quoted = ", ".join(f'"{column}"' for column in columns)
    order_by = '"id"' if "id" in columns else "rowid"
    for row in connection.execute(f'SELECT {quoted} FROM "{table}" ORDER BY {order_by}'):
        digest.update(
            json.dumps(tuple(row), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        )
        digest.update(b"\n")
    return digest.hexdigest()


def normalize_sentence(text: str) -> str:
    text = re.sub(r"\s+", " ", text.strip())
    text = text.replace("fluída", "fluida").replace("substância grudento", "substância grudenta")
    if text and text[0].islower():
        text = text[0].upper() + text[1:]
    if text and text[-1] not in ".!?":
        text += "."
    return text


def choose_portuguese_meaning(term: str, meanings: list[str]) -> str:
    if term in PT_OVERRIDES:
        return PT_OVERRIDES[term]

    unique = list(dict.fromkeys(normalize_sentence(meaning) for meaning in meanings if meaning.strip()))
    if not unique:
        raise RuntimeError(f"{term} não possui significado em português")

    def noise_score(value: str) -> tuple[int, int]:
        lowered = value.lower()
        score = 0
        if lowered.startswith("o som de"):
            score += 80
        if "(giongo)" in lowered or "(gitaigo)" in lowered:
            score += 50
        if "e também" in lowered:
            score += 20
        return score, len(value)

    return min(unique, key=noise_score)


def build(
    database_source: Path,
    database_output: Path,
    notion_source: Path,
    japanese_definitions: Path,
    json_output: Path,
    report_output: Path,
) -> None:
    source_data = json.loads(notion_source.read_text(encoding="utf-8"))
    ja_by_term = json.loads(japanese_definitions.read_text(encoding="utf-8"))
    entries = source_data["entries"]
    terms = [entry["term"] for entry in entries]

    if len(entries) != 189 or source_data["raw_entry_count"] != 305:
        raise RuntimeError("A extração do Notion divergiu das 305 linhas e 189 termos esperados")
    if len(terms) != len(set(terms)):
        raise RuntimeError("A fonte consolidada contém termos duplicados")
    if set(ja_by_term) != set(terms):
        missing = sorted(set(terms) - set(ja_by_term))
        extra = sorted(set(ja_by_term) - set(terms))
        raise RuntimeError(f"Definições japonesas divergentes; ausentes={missing}, extras={extra}")

    curated_entries = []
    for index, entry in enumerate(entries, start=1):
        term = entry["term"].strip()
        meaning_ja = ja_by_term[term].strip()
        if not term or not meaning_ja:
            raise RuntimeError(f"Entrada incompleta: {term!r}")
        curated_entries.append(
            {
                "id": index,
                "term": term,
                "meaningPt": choose_portuguese_meaning(term, entry["meanings_pt"]),
                "meaningJa": meaning_ja,
                "romaji": entry["romaji_variants"],
                "categories": entry["categories"],
                "sourcePages": entry["source_pages"],
            }
        )

    database_output.parent.mkdir(parents=True, exist_ok=True)
    json_output.parent.mkdir(parents=True, exist_ok=True)
    report_output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(database_source, database_output)

    connection = sqlite3.connect(database_output)
    connection.row_factory = sqlite3.Row
    tables_before = [
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
        )
    ]
    protected = {
        table: table_fingerprint(connection, table)
        for table in tables_before
        if not table.startswith("sqlite_") and table != "onomatopoeia"
    }

    if "onomatopoeia" in tables_before:
        connection.execute("DROP TABLE onomatopoeia")

    connection.execute(
        """
        CREATE TABLE onomatopoeia (
            id INTEGER PRIMARY KEY,
            term TEXT NOT NULL UNIQUE,
            meaning_pt TEXT NOT NULL,
            meaning_ja TEXT NOT NULL,
            romaji_variants TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(romaji_variants)),
            categories TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(categories)),
            source_pages TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(source_pages))
        )
        """
    )
    connection.executemany(
        """
        INSERT INTO onomatopoeia (
            id, term, meaning_pt, meaning_ja, romaji_variants, categories, source_pages
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                entry["id"],
                entry["term"],
                entry["meaningPt"],
                entry["meaningJa"],
                json.dumps(entry["romaji"], ensure_ascii=False, separators=(",", ":")),
                json.dumps(entry["categories"], ensure_ascii=False, separators=(",", ":")),
                json.dumps(entry["sourcePages"], ensure_ascii=False, separators=(",", ":")),
            )
            for entry in curated_entries
        ],
    )
    connection.commit()

    for table, fingerprint in protected.items():
        if table_fingerprint(connection, table) != fingerprint:
            raise RuntimeError(f"A tabela preexistente {table} foi alterada")

    row_count = connection.execute("SELECT COUNT(*) FROM onomatopoeia").fetchone()[0]
    unique_count = connection.execute("SELECT COUNT(DISTINCT term) FROM onomatopoeia").fetchone()[0]
    valid_json_count = connection.execute(
        """
        SELECT COUNT(*) FROM onomatopoeia
        WHERE json_valid(romaji_variants)
          AND json_valid(categories)
          AND json_valid(source_pages)
        """
    ).fetchone()[0]
    integrity_check = connection.execute("PRAGMA integrity_check").fetchone()[0]
    tables_after = [
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
        )
    ]
    connection.close()

    if row_count != 189 or unique_count != 189 or valid_json_count != 189:
        raise RuntimeError("A validação da tabela onomatopoeia falhou")
    if integrity_check != "ok":
        raise RuntimeError(f"PRAGMA integrity_check falhou: {integrity_check}")

    json_output.write_text(
        json.dumps(
            {
                "version": 1,
                "count": len(curated_entries),
                "onomatopoeia": [
                    {
                        "id": entry["id"],
                        "term": entry["term"],
                        "meaningPt": entry["meaningPt"],
                        "meaningJa": entry["meaningJa"],
                        "categories": entry["categories"],
                    }
                    for entry in curated_entries
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    category_counts = Counter(
        category for entry in curated_entries for category in entry["categories"]
    )
    report = {
        "database_source": str(database_source),
        "database_output": str(database_output),
        "database_source_sha256": sha256_file(database_source),
        "database_output_sha256": sha256_file(database_output),
        "notion_raw_entries": source_data["raw_entry_count"],
        "unique_terms": len(curated_entries),
        "exact_duplicates_consolidated": source_data["raw_entry_count"] - len(curated_entries),
        "category_relations": sum(category_counts.values()),
        "entries_by_category": dict(sorted(category_counts.items())),
        "entries_with_multiple_categories": sum(
            len(entry["categories"]) > 1 for entry in curated_entries
        ),
        "portuguese_definitions": len(curated_entries),
        "japanese_definitions": len(curated_entries),
        "integrity_check": integrity_check,
        "existing_tables_preserved": True,
        "tables_before": tables_before,
        "tables_after": tables_after,
        "source_pages": source_data["source_pages"],
    }
    report_output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-source", type=Path, required=True)
    parser.add_argument("--database-output", type=Path, required=True)
    parser.add_argument("--notion-source", type=Path, required=True)
    parser.add_argument("--japanese-definitions", type=Path, required=True)
    parser.add_argument("--json-output", type=Path, required=True)
    parser.add_argument("--report-output", type=Path, required=True)
    return parser.parse_args()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    args = parse_args()
    build(
        database_source=args.database_source,
        database_output=args.database_output,
        notion_source=args.notion_source,
        japanese_definitions=args.japanese_definitions,
        json_output=args.json_output,
        report_output=args.report_output,
    )
