import json
import sqlite3
import sys
from pathlib import Path


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    for raw_path in sys.argv[1:]:
        path = Path(raw_path)
        print(f"DATABASE: {path}")
        connection = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
        connection.row_factory = sqlite3.Row

        tables = connection.execute(
            "SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name"
        ).fetchall()
        for table in tables:
            name = table["name"]
            columns = connection.execute(f'PRAGMA table_info("{name}")').fetchall()
            count = connection.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
            samples = connection.execute(f'SELECT * FROM "{name}" LIMIT 2').fetchall()
            print(
                json.dumps(
                    {
                        "table": name,
                        "count": count,
                        "columns": [dict(column) for column in columns],
                        "samples": [dict(sample) for sample in samples],
                        "sql": table["sql"],
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
        connection.close()


if __name__ == "__main__":
    main()
