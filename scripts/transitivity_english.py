"""Apply and verify the hand-edited verb translations and source corrections."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CURATION = ROOT / "content/transitivity/en"
EXPLANATIONS = {
    "transitive": "In this use, the verb takes an object, often marked by を.",
    "intransitive": "In this use, the verb describes an action, change, or state without a direct object.",
    "depends": "Its transitivity depends on the meaning and construction; the examples show both uses.",
}


BLOCKS = {
    "N5": (("n5-001-050.json", (1, 50)), ("n5-051-103.json", (51, 103))),
    "N4": (("n4-104-160.json", (104, 160)), ("n4-161-220.json", (161, 220)), ("n4-221-281.json", (221, 281))),
    "N3": (("n3-282-339.json", (282, 339)), ("n3-340-399.json", (340, 399)), ("n3-400-459.json", (400, 459)), ("n3-460-511.json", (460, 511))),
    "N2": (("n2-512-559.json", (512, 559)), ("n2-560-607.json", (560, 607)), ("n2-608-655.json", (608, 655)), ("n2-656-703.json", (656, 703)), ("n2-704-751.json", (704, 751)), ("n2-752-799.json", (752, 799)), ("n2-800-847.json", (800, 847)), ("n2-848-889.json", (848, 889))),
    "N1": (("n1-890-939.json", (890, 939)), ("n1-940-989.json", (940, 989)), ("n1-990-1039.json", (990, 1039)), ("n1-1040-1089.json", (1040, 1089)), ("n1-1090-1139.json", (1090, 1139)), ("n1-1140-1189.json", (1140, 1189)), ("n1-1190-1239.json", (1190, 1239)), ("n1-1240-1289.json", (1240, 1289)), ("n1-1290-1339.json", (1290, 1339)), ("n1-1340-1398.json", (1340, 1398))),
}
EXPECTED = {"N5": (103, 104), "N4": (178, 180), "N3": (230, 241), "N2": (378, 385), "N1": (509, 527)}


def unique_object(pairs: list[tuple]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate curation key: {key}")
        result[key] = value
    return result


def apply_english(verbs: list[dict]) -> dict[str, dict[str, int]]:
    return {level: apply_level(verbs, level, blocks) for level, blocks in BLOCKS.items()}


def apply_level(verbs: list[dict], level: str, blocks: tuple) -> dict[str, int]:
    entries = {}
    for name, expected_range in blocks:
        block = json.loads((CURATION / name).read_text(encoding="utf-8"), object_pairs_hook=unique_object)
        if block["level"] != level or tuple(block["range"]) != expected_range:
            raise ValueError(f"Unexpected range or level in {name}")
        for entry in block["entries"]:
            id_, word, meaning, examples = entry
            if id_ in entries or not (expected_range[0] <= id_ <= expected_range[1]):
                raise ValueError(f"Duplicate or out-of-range {level} ID: {id_}")
            if not meaning.strip() or not examples or any(not text.strip() for text in examples):
                raise ValueError(f"Empty English content for {level} ID {id_}")
            entries[id_] = (word, meaning, examples)

    corrections = json.loads(
        (CURATION / f"{level.lower()}-source-corrections.json").read_text(encoding="utf-8"),
        object_pairs_hook=unique_object,
    )
    level_verbs = [verb for verb in verbs if verb["jlptLevel"] == level]
    if len(level_verbs) != EXPECTED[level][0] or set(entries) != {verb["id"] for verb in level_verbs}:
        raise ValueError(f"{level} curation does not cover exactly the source verbs")
    if not set(map(int, corrections)).issubset(entries):
        raise ValueError(f"A source correction targets a verb outside {level}")
    japanese_meanings = {}
    if level in {"N3", "N2"}:
        japanese_meanings = json.loads(
            (CURATION / f"{level.lower()}-ja-meanings.json").read_text(encoding="utf-8"),
            object_pairs_hook=unique_object,
        )
        if set(map(int, japanese_meanings)) != set(entries):
            raise ValueError(f"{level} Japanese definitions do not cover exactly the source verbs")

    example_count = 0
    for verb in level_verbs:
        id_ = verb["id"]
        word, meaning, examples = entries[id_]
        correction = corrections.get(str(id_), {})
        if word != correction.get("word", verb["word"]):
            raise ValueError(f"Japanese word mismatch for {level} ID {id_}: {word} / {verb['word']}")
        if japanese_meanings:
            verb["meaningJa"] = japanese_meanings[str(id_)]
        for key, value in correction.items():
            if key == "examples":
                if len(value) != len(verb["examples"]):
                    raise ValueError(f"Correction example count mismatch for {level} ID {id_}")
                for target, replacement in zip(verb["examples"], value):
                    if set(replacement) - {"ja", "pt", "role"}:
                        raise ValueError(f"Invalid example correction for {level} ID {id_}")
                    target.update(replacement)
            elif key in {"word", "reading", "display", "classification", "meaningPt", "meaningJa", "explanationPt", "explanationJa", "explanationEn"}:
                verb[key] = value
            else:
                raise ValueError(f"Unexpected correction field {key} for {level} ID {id_}")
        if len(examples) != len(verb["examples"]):
            raise ValueError(f"English example count mismatch for {level} ID {id_}")
        required_roles = {"transitive", "intransitive"} if verb["classification"] == "depends" else {verb["classification"]}
        actual_roles = {example["role"] for example in verb["examples"]}
        if not required_roles.issubset(actual_roles) or actual_roles - {"transitive", "intransitive"}:
            raise ValueError(f"Example roles do not match {level} ID {id_}")
        verb["meaningEn"] = meaning
        verb["explanationEn"] = correction.get("explanationEn", EXPLANATIONS[verb["classification"]])
        for target, english in zip(verb["examples"], examples):
            target["en"] = english
            example_count += 1

    if example_count != EXPECTED[level][1]:
        raise ValueError(f"Unexpected number of {level} examples: {example_count}")
    return {"verbs": len(level_verbs), "examples": example_count, "sourceCorrections": len(corrections)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=ROOT / "public/data/transitivity.json")
    parser.add_argument("--output", type=Path, default=ROOT / "public/data/transitivity.json")
    args = parser.parse_args()
    payload = json.loads(args.input.read_text(encoding="utf-8"))
    stats = apply_english(payload["verbs"])
    if payload["count"] != len(payload["verbs"]):
        raise ValueError("Catalog count does not match verb rows")
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps(stats))


if __name__ == "__main__":
    main()
