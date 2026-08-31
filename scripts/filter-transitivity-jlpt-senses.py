import argparse
import hashlib
import json
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


LEVELS = ("N5", "N4", "N3", "N2", "N1")
AUTO_LABELS = {"transitive", "intransitive", "both"}
STOPWORDS = {
    "a",
    "an",
    "and",
    "as",
    "at",
    "be",
    "by",
    "e",
    "eg",
    "etc",
    "for",
    "from",
    "g",
    "in",
    "into",
    "is",
    "it",
    "of",
    "on",
    "one",
    "ones",
    "or",
    "someone",
    "something",
    "the",
    "to",
    "with",
}
CONCEPT_GROUPS = (
    {"event", "meeting", "party", "ceremony", "function", "gathering"},
    {"phone", "telephone"},
    {"job", "work", "employment", "employed"},
    {"finish", "complete", "end"},
    {"begin", "start", "commence"},
    {"speak", "say", "tell", "talk"},
    {"look", "see", "watch", "view"},
    {"injure", "hurt", "wound"},
)
CONCEPT_BY_TOKEN = {
    token: sorted(group)[0]
    for group in CONCEPT_GROUPS
    for token in group
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize(value: str) -> str:
    return unicodedata.normalize("NFKC", value.strip())


def stem(token: str) -> str:
    irregular = {
        "became": "become",
        "brought": "bring",
        "came": "come",
        "did": "do",
        "done": "do",
        "gave": "give",
        "given": "give",
        "gone": "go",
        "had": "have",
        "held": "hold",
        "made": "make",
        "ran": "run",
        "said": "say",
        "saw": "see",
        "took": "take",
        "went": "go",
    }
    if token in irregular:
        return irregular[token]
    if len(token) > 5 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 5 and token.endswith("ing"):
        base = token[:-3]
        if len(base) > 2 and base[-1] == base[-2]:
            base = base[:-1]
        return base
    if len(token) > 4 and token.endswith("ed"):
        base = token[:-2]
        if base.endswith("i"):
            base = base[:-1] + "y"
        return base
    if len(token) > 4 and token.endswith("es"):
        return token[:-2]
    if len(token) > 3 and token.endswith("s"):
        return token[:-1]
    return token


def content_tokens(text: str) -> set[str]:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    raw = re.findall(r"[a-z]+", ascii_text.lower())
    tokens: set[str] = set()
    for token in raw:
        token = stem(token)
        if token and token not in STOPWORDS:
            tokens.add(CONCEPT_BY_TOKEN.get(token, token))
    return tokens


def meaning_targets(meanings: list[str]) -> list[dict[str, Any]]:
    targets: list[dict[str, Any]] = []
    seen: set[str] = set()
    for meaning in meanings:
        for fragment in re.split(r"\s*[;]\s*", meaning):
            fragment = normalize(fragment)
            tokens = content_tokens(fragment)
            marker = json.dumps(sorted(tokens))
            if fragment and tokens and marker not in seen:
                seen.add(marker)
                targets.append({"text": fragment, "tokens": sorted(tokens)})
    return targets


def sense_tokens(sense: dict[str, Any]) -> set[str]:
    tokens: set[str] = set()
    for gloss in sense["glosses_en"]:
        tokens.update(content_tokens(gloss))
    return tokens


def semantic_score(target_tokens: set[str], candidate_tokens: set[str]) -> int:
    overlap = target_tokens.intersection(candidate_tokens)
    if not overlap:
        return 0
    coverage = len(overlap) / len(target_tokens)
    # Do not reward shorter JMdict glosses. That made a generic one-word gloss
    # outrank another equally valid nearby sense solely for being terse.
    return int(len(overlap) * 100 + coverage * 30)


def sense_key(sense: dict[str, Any]) -> tuple[str, int]:
    return (sense["jmdict_sequence"], int(sense["sense_index"]))


def select_jlpt_senses(entry: dict[str, Any]) -> dict[str, Any]:
    verb_senses = [
        sense
        for sense in entry["applicable_senses"]
        if sense["transitivity"] in AUTO_LABELS
    ]
    if not verb_senses:
        return {
            "selected": [],
            "secondary": [],
            "targets": meaning_targets(entry["meanings_openjlpt_en"]),
            "fallback_targets": [],
            "decisions": [],
        }

    targets = meaning_targets(entry["meanings_openjlpt_en"])
    selected: dict[tuple[str, int], dict[str, Any]] = {}
    fallback_targets: list[str] = []
    decisions: list[dict[str, Any]] = []

    for target in targets:
        target_set = set(target["tokens"])
        scored = [
            {
                "sense": sense,
                "score": semantic_score(target_set, sense_tokens(sense)),
            }
            for sense in verb_senses
        ]
        maximum = max(candidate["score"] for candidate in scored)
        if maximum == 0:
            chosen = [min(verb_senses, key=lambda sense: int(sense["sense_index"]))]
            fallback_targets.append(target["text"])
            basis = "first_applicable_verb_sense"
        else:
            top = [candidate["sense"] for candidate in scored if candidate["score"] == maximum]
            earliest = min(int(sense["sense_index"]) for sense in top)
            chosen = [
                sense
                for sense in top
                if int(sense["sense_index"]) <= earliest + 1
            ]
            basis = "english_gloss_overlap_then_jmdict_order"

        for sense in chosen:
            selected[sense_key(sense)] = sense
        decisions.append(
            {
                "target": target["text"],
                "tokens": target["tokens"],
                "maximum_score": maximum,
                "basis": basis,
                "selected_senses": [
                    {
                        "jmdict_sequence": sense["jmdict_sequence"],
                        "sense_index": sense["sense_index"],
                        "transitivity": sense["transitivity"],
                        "glosses_en": sense["glosses_en"],
                    }
                    for sense in chosen
                ],
            }
        )

    if not selected:
        first = min(verb_senses, key=lambda sense: int(sense["sense_index"]))
        selected[sense_key(first)] = first

    secondary = [sense for sense in verb_senses if sense_key(sense) not in selected]
    return {
        "selected": list(selected.values()),
        "secondary": secondary,
        "targets": targets,
        "fallback_targets": fallback_targets,
        "decisions": decisions,
    }


def classification_from_senses(senses: list[dict[str, Any]]) -> str:
    has_vt = any(sense["transitivity"] in {"transitive", "both"} for sense in senses)
    has_vi = any(sense["transitivity"] in {"intransitive", "both"} for sense in senses)
    if has_vt and has_vi:
        return "both"
    if has_vt:
        return "transitive"
    if has_vi:
        return "intransitive"
    return "unresolved"


def filter_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for source in entries:
        entry = dict(source)
        entry["dictionary_wide_classification"] = source["classification"]
        if source["classification"] not in AUTO_LABELS:
            entry["jlpt_sense_classification"] = source["classification"]
            entry["jlpt_sense_selection"] = None
            output.append(entry)
            continue

        selection = select_jlpt_senses(source)
        classification = classification_from_senses(selection["selected"])
        if classification == "unresolved":
            raise RuntimeError(f"Nenhum sentido selecionado para {source['display']}")

        selected_keys = {sense_key(sense) for sense in selection["selected"]}
        selected_examples = [
            example
            for example in source["jmdict_examples"]
            if (
                example.get("jmdict_sequence", ""),
                int(example.get("sense_index", 0)),
            )
            in selected_keys
        ]
        vt_examples = [
            example for example in selected_examples if example["transitivity"] == "transitive"
        ]
        vi_examples = [
            example for example in selected_examples if example["transitivity"] == "intransitive"
        ]
        if classification == "both":
            ready = bool(vt_examples and vi_examples)
        else:
            typed = vt_examples if classification == "transitive" else vi_examples
            ready = bool(typed or source["openjlpt_examples"])

        entry["classification"] = classification
        entry["jlpt_sense_classification"] = classification
        entry["jlpt_sense_selection"] = {
            "meaning_targets": selection["targets"],
            "decisions": selection["decisions"],
            "fallback_targets": selection["fallback_targets"],
            "selected_senses": selection["selected"],
            "secondary_senses_for_explanation": selection["secondary"],
            "selected_jmdict_examples": selected_examples,
            "example_audit": {
                "transitive_examples": len(vt_examples),
                "intransitive_examples": len(vi_examples),
                "openjlpt_untyped_examples": len(source["openjlpt_examples"]),
                "ready": ready,
                "needs_curated_examples": not ready,
            },
        }
        output.append(entry)
    return output


def summarize(entries: list[dict[str, Any]]) -> dict[str, Any]:
    classified = [entry for entry in entries if entry["classification"] in AUTO_LABELS]
    counts = Counter(entry["classification"] for entry in classified)
    changed = [
        entry
        for entry in classified
        if entry["dictionary_wide_classification"] != entry["classification"]
    ]
    by_level: dict[str, Any] = {}
    for level in LEVELS:
        rows = [entry for entry in classified if entry["jlpt_level"] == level]
        level_counts = Counter(entry["classification"] for entry in rows)
        by_level[level] = {
            "transitive": level_counts["transitive"],
            "intransitive": level_counts["intransitive"],
            "depends": level_counts["both"],
            "total": len(rows),
        }

    selections = [entry["jlpt_sense_selection"] for entry in classified]
    depends = [entry for entry in classified if entry["classification"] == "both"]
    return {
        "classified_entries_total": len(classified),
        "transitive_entries": counts["transitive"],
        "intransitive_entries": counts["intransitive"],
        "depends_entries": counts["both"],
        "classified_by_level": by_level,
        "classification_changes_from_dictionary_wide": len(changed),
        "classification_change_matrix": dict(
            sorted(
                Counter(
                    f"{entry['dictionary_wide_classification']} -> {entry['classification']}"
                    for entry in changed
                ).items()
            )
        ),
        "fallback_meaning_targets": sum(
            len(selection["fallback_targets"]) for selection in selections
        ),
        "secondary_senses_retained_for_explanation": sum(
            len(selection["secondary_senses_for_explanation"])
            for selection in selections
        ),
        "entries_needing_curated_examples": sum(
            selection["example_audit"]["needs_curated_examples"]
            for selection in selections
        ),
        "depends_ready_with_vt_and_vi_examples": sum(
            entry["jlpt_sense_selection"]["example_audit"]["ready"]
            for entry in depends
        ),
        "depends_needing_context_pair": sum(
            entry["jlpt_sense_selection"]["example_audit"]["needs_curated_examples"]
            for entry in depends
        ),
        "changed_samples": [
            {
                "display": entry["display"],
                "level": entry["jlpt_level"],
                "from": entry["dictionary_wide_classification"],
                "to": entry["classification"],
                "meanings": entry["meanings_openjlpt_en"],
            }
            for entry in changed[:80]
        ],
    }


def main() -> None:
    sys_stdout = getattr(__import__("sys").stdout, "reconfigure", None)
    if sys_stdout:
        sys_stdout(encoding="utf-8")

    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--entries-output", type=Path, required=True)
    parser.add_argument("--report-output", type=Path, required=True)
    args = parser.parse_args()

    source = json.loads(args.input.read_text(encoding="utf-8"))
    entries = filter_entries(source["entries"])
    summary = summarize(entries)
    if summary["classified_entries_total"] != 1398:
        raise RuntimeError("A filtragem perdeu candidatos previamente classificados")

    generated_at = datetime.now(timezone.utc).isoformat()
    args.entries_output.parent.mkdir(parents=True, exist_ok=True)
    args.report_output.parent.mkdir(parents=True, exist_ok=True)
    args.entries_output.write_text(
        json.dumps(
            {
                "version": 2,
                "generated_at": generated_at,
                "source_artifact": str(args.input),
                "source_sha256": sha256_file(args.input),
                "classification_scope": "OpenJLPT-listed/common sense; secondary JMdict senses retained for explanation",
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
        "generated_at": generated_at,
        "source_artifact": str(args.input),
        "source_sha256": sha256_file(args.input),
        "method": "Each OpenJLPT English meaning is aligned to applicable JMdict verb senses by content-word overlap; tied nearby senses use JMdict order; unmatched meanings fall back to the first applicable verb sense. Non-selected senses remain attached for explanations but cannot change the quiz answer.",
        **summary,
        "entries_artifact": str(args.entries_output),
    }
    args.report_output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
