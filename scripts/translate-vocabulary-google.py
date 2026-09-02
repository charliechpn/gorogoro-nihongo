#!/usr/bin/env python3
"""Translate the OpenJLPT glosses used by the kanji vocabulary deck.

Only entries already present in the project's ``full_words`` corpus are
selected. Translations are marker-delimited, batched, cached after every
successful request, and can be resumed safely.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from pathlib import Path
from typing import Iterable


LEVELS = ("N5", "N4", "N3", "N2", "N1")
MOZHI_ENDPOINTS = (
    "https://mozhi.pussthecat.org/api/translate",
    "https://translate.privacyredirect.com/api/translate",
    "https://mozhi.bloat.cat/api/translate",
    "https://mozhi.catsarch.com/api/translate",
)
MARKER_RE = re.compile(r"ZXQ(\d{4})QXZ\s*")
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
SPECIAL_TRANSLATIONS = {
    "# 1": "número um",
    "10": "10",
    "10^-2": "10⁻²",
    "10^-3": "10⁻³",
    "10^3": "10³",
    "10^38": "10³⁸",
}
CORRUPT_GLOSSES = {"#NAME?", "+-", "3", "r", "t"}
request_counter = 0


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
    by_id = [""] * expected
    for line in translated.splitlines():
        match = MARKER_RE.search(line)
        if not match:
            continue
        item_id = int(match.group(1))
        if item_id >= expected:
            return None
        value = MARKER_RE.sub("", line).strip(" \n\r\t:;|-—")
        if value:
            by_id[item_id] = value

    if all(by_id):
        return by_id

    matches = list(MARKER_RE.finditer(translated))
    if len(matches) != expected:
        return None

    by_id = [""] * expected
    markers_lead = translated.lstrip().startswith("ZXQ")
    for index, match in enumerate(matches):
        item_id = int(match.group(1))
        if item_id >= expected:
            return None
        if markers_lead:
            end = matches[index + 1].start() if index + 1 < len(matches) else len(translated)
            value = translated[match.end():end].strip(" \n\r\t:;|-—")
        else:
            start = matches[index - 1].end() if index > 0 else 0
            value = translated[start:match.start()].strip(" \n\r\t:;|-—")
        if not value:
            return None
        by_id[item_id] = value

    return by_id if all(by_id) else None


def request_translation(texts: list[str], attempts: int = 2) -> list[str]:
    global request_counter
    marked = "\n".join(f"ZXQ{index:04d}QXZ {text}" for index, text in enumerate(texts))

    for attempt in range(attempts):
        endpoint = MOZHI_ENDPOINTS[request_counter % len(MOZHI_ENDPOINTS)]
        request_counter += 1
        completed = subprocess.run(
            [
                "curl.exe",
                "-sS",
                "--fail-with-body",
                "--max-time",
                "20",
                "-G",
                endpoint,
                "--data-urlencode",
                "engine=google",
                "--data-urlencode",
                "from=en",
                "--data-urlencode",
                "to=pt",
                "--data-urlencode",
                f"text={marked}",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        if completed.returncode == 0:
            try:
                response = json.loads(completed.stdout)
                translated_text = str(response["translated-text"])
                parsed = parse_marked(translated_text, len(texts))
                if len(texts) == 1 and parsed is None:
                    unmarked = MARKER_RE.sub("", translated_text).strip(" \n\r\t:;|-—")
                    parsed = [unmarked] if unmarked else None
            except (KeyError, TypeError, json.JSONDecodeError):
                parsed = None
            if parsed:
                return parsed

        if attempt + 1 < attempts:
            time.sleep(2**attempt)

    if len(texts) == 1:
        try:
            workspace = Path.cwd()
            os.environ.setdefault("XDG_DATA_HOME", str(workspace / "data" / "xdg-data"))
            os.environ.setdefault("XDG_CONFIG_HOME", str(workspace / "data" / "xdg-config"))
            os.environ.setdefault("XDG_CACHE_HOME", str(workspace / "data" / "xdg-cache"))
            os.environ.setdefault("ARGOS_PACKAGES_DIR", str(workspace / "data" / "argos-packages"))
            os.environ.setdefault("ARGOS_CHUNK_TYPE", "MINISBD")
            from argostranslate import translate

            fallback = " ".join(translate.translate(texts[0], "en", "pt").split())
        except Exception as error:  # pragma: no cover - only used after network failure
            raise RuntimeError(f"Translation failed for: {texts[0]!r}") from error
        if not fallback:
            raise RuntimeError(f"Translation failed for: {texts[0]!r}")
        return [fallback]

    middle = len(texts) // 2
    return [
        *request_translation(texts[:middle], attempts=attempts),
        *request_translation(texts[middle:], attempts=attempts),
    ]


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
        "--reuse-cache",
        type=Path,
        default=Path("data/transitivity-google-translation-cache.json"),
    )
    parser.add_argument("--max-chars", type=int, default=1800)
    parser.add_argument("--max-items", type=int, default=20)
    args = parser.parse_args()

    entries = selected_entries(args.vocab_dir, args.database)
    glosses = sorted({
        meaning
        for entry in entries
        for meaning in repaired_meanings(entry["meanings"])
    })

    valid_keys = {f"en->pt\n{text}" for text in glosses}
    existing_cache = (
        json.loads(args.cache.read_text(encoding="utf-8"))
        if args.cache.exists()
        else {}
    )
    cache: dict[str, str] = {
        key: value for key, value in existing_cache.items() if key in valid_keys
    }
    if args.reuse_cache.exists():
        reusable = json.loads(args.reuse_cache.read_text(encoding="utf-8"))
        for key in valid_keys:
            if key not in cache and key in reusable:
                cache[key] = reusable[key]
    for source, translated in SPECIAL_TRANSLATIONS.items():
        cache.setdefault(f"en->pt\n{source}", translated)
    save_cache(args.cache, cache)

    missing = [text for text in glosses if f"en->pt\n{text}" not in cache]
    batches = list(chunks(missing, args.max_chars, args.max_items))
    completed_count = 0

    print(
        json.dumps(
            {
                "selected_entries": len(entries),
                "unique_glosses": len(glosses),
                "cached_glosses": len(glosses) - len(missing),
                "missing_glosses": len(missing),
                "batches": len(batches),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )

    for batch_index, batch in enumerate(batches, start=1):
        translated = request_translation(batch)
        for source, result in zip(batch, translated, strict=True):
            cache[f"en->pt\n{source}"] = " ".join(result.split())
        completed_count += len(batch)
        save_cache(args.cache, cache)
        print(
            f"lote {batch_index}/{len(batches)} | {completed_count}/{len(missing)} traduções novas",
            flush=True,
        )
        time.sleep(0.15)

    present = sum(1 for text in glosses if f"en->pt\n{text}" in cache)
    if present != len(glosses):
        raise RuntimeError(f"Incomplete cache: {present}/{len(glosses)}")

    save_cache(args.cache, cache)
    print(json.dumps({"status": "complete", "translated_glosses": present}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
