import argparse
import gzip
import hashlib
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


LEVELS = ("N5", "N4", "N3", "N2", "N1")
LEVEL_RANK = {level: index for index, level in enumerate(LEVELS)}
XML_LANG = "{http://www.w3.org/XML/1998/namespace}lang"
TRANSITIVE_TAG = "transitive verb"
INTRANSITIVE_TAG = "intransitive verb"
JMDICT_URL = "https://www.edrdg.org/pub/Nihongo/JMdict_e_examp.gz"
OPENJLPT_URL = "https://github.com/evanclan/OpenJLPT"
KANJI_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
VERB_GLOSS_RE = re.compile(
    r"(?:^|[.;]\s*)(?:\([^)]*\)\s*)*to\b", re.IGNORECASE
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize(value: str) -> str:
    return unicodedata.normalize("NFKC", value.strip())


def is_verb_pos(pos_tags: list[str]) -> bool:
    # Word boundaries matter: "adverb" is not a verb, despite containing
    # the same four letters and trying very hard to ruin this audit.
    return any(re.search(r"\bverb\b", tag, re.IGNORECASE) for tag in pos_tags)


def contains_kanji(value: str) -> bool:
    return bool(KANJI_RE.search(value))


def is_all_kanji(value: str) -> bool:
    return bool(value) and all(KANJI_RE.fullmatch(character) for character in value)


def has_openjlpt_verb_hint(meanings: list[str]) -> bool:
    return any(VERB_GLOSS_RE.search(meaning.strip()) for meaning in meanings)


def classify(has_vt: bool, has_vi: bool, has_verb_pos: bool) -> str:
    if has_vt and has_vi:
        return "both"
    if has_vt:
        return "transitive"
    if has_vi:
        return "intransitive"
    if has_verb_pos:
        return "verb_without_transitivity_tag"
    return "matched_nonverb"


def load_openjlpt(vocab_dir: Path) -> tuple[dict[tuple[str, str], dict[str, Any]], dict[str, Any]]:
    grouped: dict[tuple[str, str], dict[str, Any]] = {}
    raw_counts: dict[str, int] = {}
    raw_entries = 0

    for level in LEVELS:
        path = vocab_dir / f"{level.lower()}.json"
        entries = json.loads(path.read_text(encoding="utf-8"))
        raw_counts[level] = len(entries)
        raw_entries += len(entries)

        for entry in entries:
            source_word = normalize(entry.get("word", ""))
            source_reading = normalize(entry.get("reading", "")) or source_word
            if not source_word or not source_reading:
                raise RuntimeError(f"Entrada OpenJLPT incompleta em {path}: {entry}")

            derived_suru = (
                len(source_reading) > len("する")
                and source_reading.endswith("する")
                and not source_word.endswith("する")
                and is_all_kanji(source_word)
            )
            word = f"{source_word}する" if derived_suru else source_word
            reading = source_reading
            lookup_word = source_word
            lookup_reading = (
                source_reading[: -len("する")] if derived_suru else source_reading
            )
            if not word or not reading:
                raise RuntimeError(f"Entrada OpenJLPT incompleta em {path}: {entry}")

            key = (word, reading)
            current = grouped.setdefault(
                key,
                {
                    "word": word,
                    "reading": reading,
                    "openjlpt_word": source_word,
                    "openjlpt_reading": source_reading,
                    "lookup_word": lookup_word,
                    "lookup_reading": lookup_reading,
                    "derived_suru_form": derived_suru,
                    "levels": [],
                    "meanings_en": [],
                    "openjlpt_examples": [],
                },
            )
            if level not in current["levels"]:
                current["levels"].append(level)
            for meaning in entry.get("meanings", []):
                meaning = meaning.strip()
                if meaning and meaning not in current["meanings_en"]:
                    current["meanings_en"].append(meaning)
            for example in entry.get("examples", []):
                candidate = {
                    "ja": normalize(example.get("ja", "")),
                    "en": example.get("en", "").strip(),
                    "source": "OpenJLPT/Tatoeba",
                    "transitivity": "unknown",
                }
                if candidate["ja"] and candidate not in current["openjlpt_examples"]:
                    current["openjlpt_examples"].append(candidate)

    level_conflicts = {
        f"{word}（{reading}）": data["levels"]
        for (word, reading), data in grouped.items()
        if len(data["levels"]) > 1
    }
    for data in grouped.values():
        data["levels"].sort(key=LEVEL_RANK.get)
        data["jlpt_level"] = data["levels"][0]
        data["contains_kanji"] = contains_kanji(data["word"])
        data["openjlpt_verb_hint"] = has_openjlpt_verb_hint(data["meanings_en"])

    metadata = {
        "raw_entries": raw_entries,
        "raw_entries_by_level": raw_counts,
        "unique_word_reading_pairs": len(grouped),
        "duplicate_rows_consolidated": raw_entries - len(grouped),
        "pairs_listed_in_multiple_levels": len(level_conflicts),
        "derived_suru_forms": sum(
            data["derived_suru_form"] for data in grouped.values()
        ),
        "verb_candidates_from_openjlpt_gloss": sum(
            data["openjlpt_verb_hint"] for data in grouped.values()
        ),
        "level_conflicts": level_conflicts,
    }
    return grouped, metadata


def sense_pos_tags(sense: ET.Element, inherited: list[str]) -> list[str]:
    explicit = [normalize(element.text or "") for element in sense.findall("pos")]
    return explicit or inherited


def sense_applies(sense: ET.Element, word: str, reading: str, word_is_kanji_form: bool) -> bool:
    reading_restrictions = {normalize(element.text or "") for element in sense.findall("stagr")}
    if reading_restrictions and reading not in reading_restrictions:
        return False

    spelling_restrictions = {normalize(element.text or "") for element in sense.findall("stagk")}
    if spelling_restrictions:
        if not word_is_kanji_form or word not in spelling_restrictions:
            return False
    return True


def reading_applies(reading_element: ET.Element, word: str) -> bool:
    restrictions = {normalize(element.text or "") for element in reading_element.findall("re_restr")}
    return not restrictions or word in restrictions


def extract_examples(
    sense: ET.Element,
    transitivity: str,
    jmdict_sequence: str,
    sense_index: int,
) -> list[dict[str, Any]]:
    examples: list[dict[str, str]] = []
    for element in sense.findall("example"):
        source = element.find("ex_srce")
        japanese = ""
        english = ""
        for sentence in element.findall("ex_sent"):
            language = sentence.attrib.get(XML_LANG, "")
            if language == "jpn":
                japanese = normalize(sentence.text or "")
            elif language == "eng":
                english = (sentence.text or "").strip()
        if not japanese:
            continue
        examples.append(
            {
                "ja": japanese,
                "en": english,
                "source": "JMdict/Tatoeba",
                "source_id": (source.text or "").strip() if source is not None else "",
                "jmdict_sequence": jmdict_sequence,
                "sense_index": sense_index,
                "transitivity": transitivity,
            }
        )
    return examples


def parse_jmdict(
    path: Path,
    targets: dict[tuple[str, str], dict[str, Any]],
) -> tuple[dict[tuple[str, str], dict[str, Any]], dict[str, int]]:
    targets_by_lookup_word: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for key, target in targets.items():
        targets_by_lookup_word[target["lookup_word"]].append(key)

    matches: dict[tuple[str, str], dict[str, Any]] = defaultdict(
        lambda: {
            "jmdict_sequences": [],
            "has_vt": False,
            "has_vi": False,
            "has_verb_pos": False,
            "matched_entries": [],
            "senses": [],
            "jmdict_examples": [],
        }
    )
    parsed_entries = 0
    entries_touching_targets = 0
    senses_examined = 0

    with gzip.open(path, "rb") as file:
        for _, entry in ET.iterparse(file, events=("end",)):
            if entry.tag != "entry":
                continue
            parsed_entries += 1
            if parsed_entries % 50000 == 0:
                print(
                    f"JMdict: {parsed_entries:,} entradas processadas...",
                    file=sys.stderr,
                    flush=True,
                )
            sequence = normalize(entry.findtext("ent_seq", default=""))
            kanji_forms = [normalize(element.text or "") for element in entry.findall("k_ele/keb")]
            reading_elements = entry.findall("r_ele")
            readings = [normalize(element.findtext("reb", default="")) for element in reading_elements]

            candidate_keys: list[tuple[tuple[str, str], bool]] = []
            for lookup_word in set(kanji_forms).intersection(targets_by_lookup_word):
                for key in targets_by_lookup_word[lookup_word]:
                    target = targets[key]
                    if not target["openjlpt_verb_hint"]:
                        continue
                    for reading_element in reading_elements:
                        reb = normalize(reading_element.findtext("reb", default=""))
                        if (
                            reb == target["lookup_reading"]
                            and reading_applies(reading_element, lookup_word)
                        ):
                            candidate_keys.append((key, True))
                            break

            for lookup_word in set(readings).intersection(targets_by_lookup_word):
                for key in targets_by_lookup_word[lookup_word]:
                    target = targets[key]
                    if (
                        target["openjlpt_verb_hint"]
                        and not target["contains_kanji"]
                        and target["lookup_word"] == target["lookup_reading"]
                    ):
                        candidate_keys.append((key, False))

            candidate_keys = list(dict.fromkeys(candidate_keys))
            if not candidate_keys:
                entry.clear()
                continue

            entries_touching_targets += 1
            inherited_pos: list[str] = []
            prepared_senses: list[dict[str, Any]] = []
            for sense_index, sense in enumerate(entry.findall("sense"), start=1):
                pos_tags = sense_pos_tags(sense, inherited_pos)
                if sense.findall("pos"):
                    inherited_pos = pos_tags
                has_vt = TRANSITIVE_TAG in pos_tags
                has_vi = INTRANSITIVE_TAG in pos_tags
                sense_transitivity = classify(has_vt, has_vi, is_verb_pos(pos_tags))
                glosses = [
                    (gloss.text or "").strip()
                    for gloss in sense.findall("gloss")
                    if gloss.attrib.get(XML_LANG, "eng") == "eng" and (gloss.text or "").strip()
                ]
                prepared_senses.append(
                    {
                        "element": sense,
                        "sense_index": sense_index,
                        "pos_tags": pos_tags,
                        "has_vt": has_vt,
                        "has_vi": has_vi,
                        "is_verb": is_verb_pos(pos_tags),
                        "transitivity": sense_transitivity,
                        "glosses_en": glosses,
                    }
                )

            for key, word_is_kanji_form in candidate_keys:
                word, reading = key
                target = targets[key]
                lookup_word = target["lookup_word"]
                lookup_reading = target["lookup_reading"]
                applicable = [
                    prepared
                    for prepared in prepared_senses
                    if sense_applies(
                        prepared["element"],
                        lookup_word,
                        lookup_reading,
                        word_is_kanji_form,
                    )
                ]
                # Kana-only targets are vulnerable to unrelated homophones.
                # Ignore dictionary entries that do not provide a verb sense;
                # ambiguity between multiple verb lexemes is reported later.
                if not word_is_kanji_form and not any(
                    prepared["is_verb"] for prepared in applicable
                ):
                    continue

                result = matches[key]
                if sequence and sequence not in result["jmdict_sequences"]:
                    result["jmdict_sequences"].append(sequence)

                entry_has_vt = any(prepared["has_vt"] for prepared in applicable)
                entry_has_vi = any(prepared["has_vi"] for prepared in applicable)
                entry_has_verb = any(prepared["is_verb"] for prepared in applicable)
                result["matched_entries"].append(
                    {
                        "jmdict_sequence": sequence,
                        "kanji_forms": kanji_forms,
                        "reading": lookup_reading,
                        "has_vt": entry_has_vt,
                        "has_vi": entry_has_vi,
                        "has_verb_pos": entry_has_verb,
                        "classification": classify(
                            entry_has_vt, entry_has_vi, entry_has_verb
                        ),
                    }
                )

                for prepared in applicable:
                    sense = prepared["element"]
                    senses_examined += 1
                    result["has_vt"] = result["has_vt"] or prepared["has_vt"]
                    result["has_vi"] = result["has_vi"] or prepared["has_vi"]
                    result["has_verb_pos"] = result["has_verb_pos"] or prepared["is_verb"]
                    result["senses"].append(
                        {
                            "jmdict_sequence": sequence,
                            "sense_index": prepared["sense_index"],
                            "transitivity": prepared["transitivity"],
                            "pos_tags": prepared["pos_tags"],
                            "glosses_en": prepared["glosses_en"],
                        }
                    )
                    result["jmdict_examples"].extend(
                        extract_examples(
                            sense,
                            prepared["transitivity"],
                            sequence,
                            prepared["sense_index"],
                        )
                    )
            entry.clear()

    return matches, {
        "parsed_entries": parsed_entries,
        "entries_touching_openjlpt_pairs": entries_touching_targets,
        "applicable_senses_examined": senses_examined,
    }


def deduplicate_dicts(values: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for value in values:
        marker = json.dumps(value, ensure_ascii=False, sort_keys=True)
        if marker not in seen:
            seen.add(marker)
            unique.append(value)
    return unique


def finalize_entries(
    openjlpt: dict[tuple[str, str], dict[str, Any]],
    matches: dict[tuple[str, str], dict[str, Any]],
) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for key, source in openjlpt.items():
        match = matches.get(key)
        if not source["openjlpt_verb_hint"]:
            classification = "not_verb_candidate"
            match = {
                "jmdict_sequences": [],
                "has_vt": False,
                "has_vi": False,
                "has_verb_pos": False,
                "matched_entries": [],
                "senses": [],
                "jmdict_examples": [],
            }
        elif match is None:
            classification = "no_jmdict_match"
            match = {
                "jmdict_sequences": [],
                "has_vt": False,
                "has_vi": False,
                "has_verb_pos": False,
                "matched_entries": [],
                "senses": [],
                "jmdict_examples": [],
            }
        else:
            classification = classify(match["has_vt"], match["has_vi"], match["has_verb_pos"])
            if (
                not source["contains_kanji"]
                and len(match["jmdict_sequences"]) > 1
                and match["has_verb_pos"]
            ):
                classification = "kana_homograph_review"

        relevant_examples = deduplicate_dicts(match["jmdict_examples"])
        openjlpt_examples = deduplicate_dicts(source["openjlpt_examples"])
        vt_examples = [example for example in relevant_examples if example["transitivity"] == "transitive"]
        vi_examples = [example for example in relevant_examples if example["transitivity"] == "intransitive"]
        both_examples = [example for example in relevant_examples if example["transitivity"] == "both"]

        if classification == "both":
            ready_from_jmdict = bool(vt_examples and vi_examples)
            needs_curated_examples = not ready_from_jmdict
        elif classification in {"transitive", "intransitive"}:
            typed = vt_examples if classification == "transitive" else vi_examples
            ready_from_jmdict = bool(typed)
            needs_curated_examples = not (typed or openjlpt_examples)
        else:
            ready_from_jmdict = False
            needs_curated_examples = False

        output.append(
            {
                "word": source["word"],
                "reading": source["reading"],
                "display": f'{source["word"]}（{source["reading"]}）',
                "jlpt_level": source["jlpt_level"],
                "listed_levels": source["levels"],
                "openjlpt_original": {
                    "word": source["openjlpt_word"],
                    "reading": source["openjlpt_reading"],
                },
                "lookup_word": source["lookup_word"],
                "lookup_reading": source["lookup_reading"],
                "derived_suru_form": source["derived_suru_form"],
                "contains_kanji": source["contains_kanji"],
                "openjlpt_verb_hint": source["openjlpt_verb_hint"],
                "classification": classification,
                "jmdict_sequences": match["jmdict_sequences"],
                "matched_jmdict_entries": deduplicate_dicts(match["matched_entries"]),
                "meanings_openjlpt_en": source["meanings_en"],
                "applicable_senses": match["senses"],
                "jmdict_examples": relevant_examples,
                "openjlpt_examples": openjlpt_examples,
                "example_audit": {
                    "jmdict_transitive_examples": len(vt_examples),
                    "jmdict_intransitive_examples": len(vi_examples),
                    "jmdict_both_examples": len(both_examples),
                    "openjlpt_untyped_examples": len(openjlpt_examples),
                    "ready_from_sense_linked_jmdict": ready_from_jmdict,
                    "needs_curated_examples": needs_curated_examples,
                },
            }
        )

    output.sort(key=lambda entry: (LEVEL_RANK[entry["jlpt_level"]], entry["word"], entry["reading"]))
    return output


def summarize(entries: list[dict[str, Any]]) -> dict[str, Any]:
    classifications = Counter(entry["classification"] for entry in entries)
    included = [
        entry
        for entry in entries
        if entry["classification"] in {"transitive", "intransitive", "both"}
    ]
    by_level: dict[str, Any] = {}
    for level in LEVELS:
        level_entries = [entry for entry in entries if entry["jlpt_level"] == level]
        level_included = [entry for entry in included if entry["jlpt_level"] == level]
        level_counts = Counter(entry["classification"] for entry in level_entries)
        by_level[level] = {
            "openjlpt_unique_pairs": len(level_entries),
            "transitive": level_counts["transitive"],
            "intransitive": level_counts["intransitive"],
            "both": level_counts["both"],
            "classified_for_game": len(level_included),
            "needs_curated_examples": sum(
                entry["example_audit"]["needs_curated_examples"] for entry in level_included
            ),
        }

    both_entries = [entry for entry in included if entry["classification"] == "both"]
    single_entries = [entry for entry in included if entry["classification"] != "both"]
    return {
        "classification_counts": dict(sorted(classifications.items())),
        "classified_entries_total": len(included),
        "classified_by_level": by_level,
        "transitive_entries": classifications["transitive"],
        "intransitive_entries": classifications["intransitive"],
        "depends_entries": classifications["both"],
        "kana_homographs_needing_resolution": classifications["kana_homograph_review"],
        "single_label_with_any_source_example": sum(
            bool(entry["jmdict_examples"] or entry["openjlpt_examples"])
            for entry in single_entries
        ),
        "depends_ready_with_one_vt_and_one_vi_jmdict_example": sum(
            entry["example_audit"]["ready_from_sense_linked_jmdict"]
            for entry in both_entries
        ),
        "entries_needing_curated_examples": sum(
            entry["example_audit"]["needs_curated_examples"] for entry in included
        ),
        "depends_entries_requiring_manual_context_examples": sum(
            entry["example_audit"]["needs_curated_examples"] for entry in both_entries
        ),
        "multiple_jmdict_entry_matches": sum(
            len(entry["jmdict_sequences"]) > 1 for entry in entries
        ),
    }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--vocab-dir", type=Path, required=True)
    parser.add_argument("--jmdict", type=Path, required=True)
    parser.add_argument("--openjlpt-commit", required=True)
    parser.add_argument("--entries-output", type=Path, required=True)
    parser.add_argument("--report-output", type=Path, required=True)
    args = parser.parse_args()

    openjlpt, openjlpt_metadata = load_openjlpt(args.vocab_dir)
    matches, parse_metadata = parse_jmdict(args.jmdict, openjlpt)
    entries = finalize_entries(openjlpt, matches)
    summary = summarize(entries)

    if len(entries) != openjlpt_metadata["unique_word_reading_pairs"]:
        raise RuntimeError("A saída perdeu entradas do OpenJLPT")
    if summary["classified_entries_total"] != (
        summary["transitive_entries"]
        + summary["intransitive_entries"]
        + summary["depends_entries"]
    ):
        raise RuntimeError("A soma das classificações não fecha")

    args.entries_output.parent.mkdir(parents=True, exist_ok=True)
    args.report_output.parent.mkdir(parents=True, exist_ok=True)
    args.entries_output.write_text(
        json.dumps(
            {
                "version": 1,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "entries": entries,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    report = {
        "status": "dry_run_only",
        "database_modified": False,
        "interface_modified": False,
        "method": "OpenJLPT verb-sense candidates intersected with applicable JMdict senses and vt/vi tags; explicit OpenJLPT -suru readings are normalized to display forms ending in する",
        "caveats": [
            "The JLPT does not publish official vocabulary lists; OpenJLPT uses documented community-standard level assignments.",
            "JMdict transitivity tags apply at sense level and can be restricted by spelling or reading.",
            "OpenJLPT examples are candidates until their exact sense and transitivity are audited.",
            "OpenJLPT rows whose English gloss does not identify a verb sense are not promoted merely because JMdict permits a rare suru use.",
            "Kana-only forms matching multiple JMdict verb lexemes remain unresolved instead of receiving an automatic label.",
            "Entries classified as both require one transitive and one intransitive contextual example.",
        ],
        "sources": {
            "openjlpt": {
                "repository": OPENJLPT_URL,
                "commit": args.openjlpt_commit,
                **openjlpt_metadata,
            },
            "jmdict": {
                "url": JMDICT_URL,
                "file": str(args.jmdict),
                "sha256": sha256_file(args.jmdict),
                **parse_metadata,
            },
        },
        **summary,
        "samples": {
            "depends": [
                {
                    "display": entry["display"],
                    "level": entry["jlpt_level"],
                    "jmdict_sequences": entry["jmdict_sequences"],
                    "example_audit": entry["example_audit"],
                }
                for entry in entries
                if entry["classification"] == "both"
            ][:40],
            "unmatched": [
                entry["display"]
                for entry in entries
                if entry["classification"] == "no_jmdict_match"
            ][:80],
            "verbs_without_transitivity_tag": [
                entry["display"]
                for entry in entries
                if entry["classification"] == "verb_without_transitivity_tag"
            ][:80],
        },
        "entries_artifact": str(args.entries_output),
    }
    args.report_output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
