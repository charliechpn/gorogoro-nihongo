#!/usr/bin/env python3
"""Build a reproducible en->pt/ja cache for the transitivity database.

The input strings already belong to the local curated artifact.  Requests are
batched, marker-delimited, cached after every successful batch, and retried
individually if a batch ever loses a marker.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Iterable


MOZHI_ENDPOINTS = (
    "https://mozhi.pussthecat.org/api/translate",
    "https://translate.privacyredirect.com/api/translate",
    "https://mozhi.bloat.cat/api/translate",
    "https://mozhi.catsarch.com/api/translate",
)
MARKER_RE = re.compile(r"ZXQ(\d{4})QXZ\s*")
JAPANESE_RE = re.compile(r"[\u3040-\u30ff\u3400-\u9fff]")
request_counter = 0


def chunks(values: list[str], max_chars: int, max_items: int) -> Iterable[list[str]]:
    batch: list[str] = []
    size = 0
    for value in values:
        marked_size = len(value) + 20
        if batch and (len(batch) >= max_items or size + marked_size > max_chars):
            yield batch
            batch = []
            size = 0
        batch.append(value)
        size += marked_size
    if batch:
        yield batch


def parse_marked(translated: str, expected: int) -> list[str] | None:
    by_line = [""] * expected
    for line in translated.splitlines():
        match = MARKER_RE.search(line)
        if not match:
            continue
        item_id = int(match.group(1))
        if item_id >= expected:
            return None
        value = MARKER_RE.sub("", line).strip()
        if value:
            by_line[item_id] = value
    if all(by_line):
        return by_line

    matches = list(MARKER_RE.finditer(translated))
    if len(matches) != expected:
        return None
    result = [""] * expected
    for index, match in enumerate(matches):
        item_id = int(match.group(1))
        if item_id >= expected:
            return None
        end = matches[index + 1].start() if index + 1 < len(matches) else len(translated)
        result[item_id] = translated[match.end() : end].strip()
    return result if all(result) else None


def request_translation(texts: list[str], target: str, attempts: int = 5) -> list[str]:
    global request_counter
    marked = "\n".join(f"ZXQ{index:04d}QXZ {text}" for index, text in enumerate(texts))
    for attempt in range(attempts):
        endpoint = MOZHI_ENDPOINTS[request_counter % len(MOZHI_ENDPOINTS)]
        request_counter += 1
        command = [
            "curl.exe",
            "-sS",
            "--fail-with-body",
            "--max-time",
            "45",
            "-G",
            endpoint,
            "--data-urlencode",
            "engine=google",
            "--data-urlencode",
            "from=en",
            "--data-urlencode",
            f"to={target}",
            "--data-urlencode",
            f"text={marked}",
        ]
        completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
        if completed.returncode == 0:
            try:
                response = json.loads(completed.stdout)
                parsed = parse_marked(response["translated-text"], len(texts))
                if target == "ja" and parsed and any(
                    not JAPANESE_RE.search(value) for value in parsed
                ):
                    parsed = None
            except (KeyError, TypeError, json.JSONDecodeError):
                parsed = None
            if parsed:
                return parsed
        if attempt + 1 < attempts:
            time.sleep(2 ** attempt)
    if len(texts) == 1:
        raise RuntimeError(f"Translation failed for en->{target}: {texts[0]!r}")
    result: list[str] = []
    for text in texts:
        result.extend(request_translation([text], target, attempts=attempts))
    return result


def save_cache(path: Path, cache: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database",
        type=Path,
        default=Path("artifacts/kanji database 1 - openjlpt-onomatopoeia-transitivity.db"),
    )
    parser.add_argument(
        "--cache",
        type=Path,
        default=Path("data/transitivity-google-translation-cache.json"),
    )
    parser.add_argument("--max-chars", type=int, default=1800)
    parser.add_argument("--max-items", type=int, default=20)
    args = parser.parse_args()

    import sqlite3

    connection = sqlite3.connect(f"file:{args.database.resolve().as_posix()}?mode=ro", uri=True)
    try:
        records = connection.execute(
            "SELECT meanings_en, examples FROM transitivity_verbs ORDER BY id"
        ).fetchall()
    finally:
        connection.close()

    meaning_texts: list[str] = []
    example_texts: list[str] = []
    for meanings_json, examples_json in records:
        meaning_texts.append(" ".join("; ".join(json.loads(meanings_json)).split()))
        example_texts.extend(
            " ".join(example["en"].split()) for example in json.loads(examples_json)
        )

    targets = {
        "pt": sorted(set(meaning_texts + example_texts)),
        "ja": sorted(set(meaning_texts)),
    }
    cache = json.loads(args.cache.read_text(encoding="utf-8")) if args.cache.exists() else {}
    invalid_japanese_keys = [
        key
        for key, value in cache.items()
        if key.startswith("en->ja\n") and not JAPANESE_RE.search(value)
    ]
    for key in invalid_japanese_keys:
        del cache[key]
    if invalid_japanese_keys:
        save_cache(args.cache, cache)
        print(
            f"Removidas {len(invalid_japanese_keys)} traduções japonesas inválidas do cache.",
            flush=True,
        )
    total_missing = sum(
        1 for target, texts in targets.items() for text in texts if f"en->{target}\n{text}" not in cache
    )
    completed_count = 0

    for target, texts in targets.items():
        missing = [text for text in texts if f"en->{target}\n{text}" not in cache]
        batches = list(chunks(missing, args.max_chars, args.max_items))
        for batch_index, batch in enumerate(batches, start=1):
            translated = request_translation(batch, target)
            for source, result in zip(batch, translated, strict=True):
                cache[f"en->{target}\n{source}"] = result
            completed_count += len(batch)
            save_cache(args.cache, cache)
            print(
                f"{target}: lote {batch_index}/{len(batches)} | "
                f"{completed_count}/{total_missing} traduções novas",
                flush=True,
            )
            time.sleep(0.15)

    expected = sum(len(texts) for texts in targets.values())
    present = sum(
        1 for target, texts in targets.items() for text in texts if f"en->{target}\n{text}" in cache
    )
    if present != expected:
        raise RuntimeError(f"Incomplete cache: {present}/{expected}")
    print(json.dumps({"status": "complete", "cache_entries": present}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
