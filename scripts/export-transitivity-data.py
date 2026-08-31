#!/usr/bin/env python3
"""Export the curated transitivity table as static data for the local game."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from collections import Counter
from pathlib import Path


LEVELS = ("N5", "N4", "N3", "N2", "N1")
CLASSIFICATIONS = {"transitive", "intransitive", "depends"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database",
        type=Path,
        default=Path("artifacts/kanji database 1 - openjlpt-onomatopoeia-transitivity.db"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("public/data/transitivity.json"),
    )
    args = parser.parse_args()

    connection = sqlite3.connect(f"file:{args.database.resolve().as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("O SQLite de transitividade falhou no integrity_check")
        rows = connection.execute(
            """
            SELECT id, word, reading, display, jlpt_level, classification,
                   meaning_pt, meaning_ja, explanation_pt, explanation_ja, examples
            FROM transitivity_verbs
            ORDER BY id
            """
        ).fetchall()
    finally:
        connection.close()

    if len(rows) != 1398:
        raise RuntimeError(f"Esperadas 1.398 entradas; recebidas {len(rows)}")

    verbs = []
    for row in rows:
        if row["jlpt_level"] not in LEVELS:
            raise RuntimeError(f"Nível inválido em {row['display']}")
        if row["classification"] not in CLASSIFICATIONS:
            raise RuntimeError(f"Classificação inválida em {row['display']}")
        examples = json.loads(row["examples"])
        required_roles = (
            {"transitive", "intransitive"}
            if row["classification"] == "depends"
            else {row["classification"]}
        )
        if not required_roles.issubset({example["role"] for example in examples}):
            raise RuntimeError(f"Exemplos incompletos em {row['display']}")
        verbs.append(
            {
                "id": row["id"],
                "word": row["word"],
                "reading": row["reading"],
                "display": row["display"],
                "jlptLevel": row["jlpt_level"],
                "classification": row["classification"],
                "meaningPt": row["meaning_pt"],
                "meaningJa": row["meaning_ja"],
                "explanationPt": row["explanation_pt"],
                "explanationJa": row["explanation_ja"],
                "examples": [
                    {
                        "role": example["role"],
                        "ja": example["ja"],
                        "pt": example["pt"],
                    }
                    for example in examples
                ],
            }
        )

    by_level = Counter(verb["jlptLevel"] for verb in verbs)
    payload = {
        "version": 1,
        "count": len(verbs),
        "byLevel": {level: by_level[level] for level in LEVELS},
        "verbs": verbs,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {"output": str(args.output), "count": len(verbs), "byLevel": payload["byLevel"]},
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
