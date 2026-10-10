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


def load_english_curations(directory: Path) -> dict[int, tuple[str, str]]:
    files = sorted(directory.glob("*.json"))
    if len(files) != 4:
        raise RuntimeError("São necessários os quatro blocos ingleses de onomatopeias")
    translations: dict[int, tuple[str, str]] = {}
    for file in files:
        document = json.loads(file.read_text(encoding="utf-8"))
        first_id, last_id = document["range"]
        if document["version"] != 1 or document["schema"] != ["id", "term", "meaningEn"]:
            raise RuntimeError(f"Formato de curadoria inválido: {file}")
        if len(document["entries"]) != last_id - first_id + 1:
            raise RuntimeError(f"Bloco inglês incompleto: {file}")
        for expected_id, row in zip(range(first_id, last_id + 1), document["entries"]):
            entry_id, term, meaning_en = row
            if entry_id != expected_id or entry_id in translations or not meaning_en.strip():
                raise RuntimeError(f"Entrada inglesa inválida: {file}, ID {entry_id}")
            translations[entry_id] = (term, meaning_en)
    if len(translations) != 189:
        raise RuntimeError("A curadoria inglesa não cobre as 189 onomatopeias")
    return translations


def build(
    database_source: Path,
    database_output: Path,
    notion_source: Path,
    japanese_definitions: Path,
    json_output: Path,
    report_output: Path,
    english_curation: Path,
) -> None:
    source_data = json.loads(notion_source.read_text(encoding="utf-8"))
    ja_by_term = json.loads(japanese_definitions.read_text(encoding="utf-8"))
    entries = source_data["entries"]
    english_by_id = load_english_curations(english_curation)
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
        english_term, meaning_en = english_by_id[index]
        if english_term != term:
            raise RuntimeError(f"Termo inglês divergente no ID {index}: {english_term}")
        if not term or not meaning_ja:
            raise RuntimeError(f"Entrada incompleta: {term!r}")
        curated_entries.append(
            {
                "id": index,
                "term": term,
                "meaningPt": choose_portuguese_meaning(term, entry["meanings_pt"]),
                "meaningEn": meaning_en,
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
            meaning_en TEXT NOT NULL,
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
            id, term, meaning_pt, meaning_en, meaning_ja, romaji_variants, categories, source_pages
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                entry["id"],
                entry["term"],
                entry["meaningPt"],
                entry["meaningEn"],
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
                "version": 2,
                "count": len(curated_entries),
                "onomatopoeia": [
                    {
                        "id": entry["id"],
                        "term": entry["term"],
                        "meaningPt": entry["meaningPt"],
                        "meaningEn": entry["meaningEn"],
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
        "english_definitions": len(curated_entries),
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
    parser.add_argument("--english-curation", type=Path, default=Path("content/onomatopoeia/en"))
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
        english_curation=args.english_curation,
    )
