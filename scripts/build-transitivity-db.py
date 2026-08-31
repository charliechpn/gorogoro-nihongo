import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


LEVELS = ("N5", "N4", "N3", "N2", "N1")
LEVEL_RANK = {level: index for index, level in enumerate(LEVELS)}
CLASSIFICATIONS = {"transitive", "intransitive", "both"}
PUBLIC_CLASSIFICATION = {
    "transitive": "transitive",
    "intransitive": "intransitive",
    "both": "depends",
}
ROLE_ORDER = {"transitive": 0, "intransitive": 1}
KANJI_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
WORD_RE = re.compile(r"[a-z]+")
STOPWORDS = {
    "a", "an", "and", "as", "at", "be", "by", "e", "eg", "etc",
    "for", "from", "g", "in", "into", "is", "it", "of", "on", "one",
    "ones", "or", "someone", "something", "the", "to", "with",
}
TRANSITIVITY_SOURCE = {
    "openjlpt": "https://github.com/evanclan/OpenJLPT",
    "jmdict": "https://www.edrdg.org/jmdict/j_jmdict.html",
    "tatoeba": "https://tatoeba.org/",
}

# Argos' generic Portuguese model occasionally emits European Portuguese and a
# handful of poor literal renderings.  Keep the raw cache reusable, then apply
# deterministic Brazilian-Portuguese editorial fixes while building records.
PT_BR_OVERRIDES = {
    "Do you sometimes give your sister money?": "Você às vezes dá dinheiro para sua irmã?",
    "The roof is shining in the sun.": "O telhado está brilhando ao sol.",
    "Don't put your things in the passage.": "Não deixe suas coisas na passagem.",
    "I'm saving money for a car.": "Estou economizando dinheiro para comprar um carro.",
    "Did you clean your room?": "Você limpou seu quarto?",
    "You must remove your shoes when you enter a Japanese house.": "Você precisa tirar os sapatos ao entrar em uma casa japonesa.",
    "You do run.": "Você realmente corre.",
    "Somebody is playing the piano.": "Alguém está tocando piano.",
    "Rose was blowing bubbles.": "Rose estava soprando bolhas de sabão.",
    "Don't let your feelings show.": "Não deixe seus sentimentos transparecerem.",
    "You don't have to hurry.": "Você não precisa se apressar.",
    "Is your mother at home?": "Sua mãe está em casa?",
    "Fifty of the machines are running at the present time.": "Cinquenta máquinas estão funcionando neste momento.",
    "You remind me of your brother.": "Você me lembra seu irmão.",
    "All right. I'll accept your offer.": "Tudo bem. Aceito sua oferta.",
    "How well that girl skis!": "Como aquela garota esquia bem!",
    "You should try to live within your means.": "Você deveria tentar viver dentro das suas possibilidades.",
    "Please say hello to your wife.": "Por favor, mande lembranças à sua esposa.",
    "Now we are having one cold day after another.": "Agora estamos tendo um dia frio atrás do outro.",
    "How would you like your steak?": "Como você quer o seu bife?",
    "I'll stay here with you.": "Vou ficar aqui com você.",
    "Besides, it's starting to rain.": "Além disso, está começando a chover.",
    "He's beating me, three to zip.": "Ele está ganhando de mim por três a zero.",
    "Bees are flying around.": "As abelhas estão voando ao redor.",
    "Jessie is boiling water to make coffee.": "Jessie está fervendo água para fazer café.",
    "I'm taking command.": "Estou assumindo o comando.",
    "The bank will cash your fifty dollar check.": "O banco vai descontar seu cheque de cinquenta dólares.",
    "You will keep your word, won't you?": "Você vai manter sua palavra, não vai?",
    "He is swimming against the tide.": "Ele está nadando contra a corrente.",
    "Don't be too hard on yourself.": "Não seja tão duro consigo mesmo.",
    "Give me a lift in your car.": "Me dê uma carona no seu carro.",
    "The sun was coming up then.": "O sol estava nascendo.",
    "My ears were ringing from being beaten.": "Meus ouvidos estavam zumbindo depois da surra.",
    "I'll leave it up to your imagination.": "Deixo isso por conta da sua imaginação.",
    "You have to protect your family.": "Você precisa proteger sua família.",
    "No, that's not the right way. You have to turn it the other way round.": "Não, não é assim. Você precisa virar para o outro lado.",
    "The tide is rising fast.": "A maré está subindo rapidamente.",
    "The fire is burning furiously.": "O fogo está queimando intensamente.",
    "The boys were banging about upstairs.": "Os garotos estavam fazendo barulho lá em cima.",
    "He is roasting coffee beans.": "Ele está torrando grãos de café.",
    "I'm staring at myself in a mirror.": "Estou me encarando no espelho.",
    "You had better supplement your diet with vitamins.": "É melhor complementar sua dieta com vitaminas.",
    "My birthday coincides with yours.": "Meu aniversário coincide com o seu.",
    "Kate is dressing her doll.": "Kate está vestindo a boneca.",
    "If you trust such a fellow, you'll lose everything you have.": "Se você confiar em um sujeito desses, perderá tudo o que tem.",
    "Time is pressing every moment.": "O tempo está se esgotando a cada instante.",
    "Don't scatter your things about.": "Não espalhe suas coisas por aí.",
    "He's doing in-depth research on ancient history.": "Ele está fazendo uma pesquisa aprofundada sobre história antiga.",
    "She is playing an important role in our organization.": "Ela está desempenhando um papel importante em nossa organização.",
    "My tape recorder is compatible with your amplifier.": "Meu gravador é compatível com seu amplificador.",
    "He hung a lamp from the ceiling.": "Ele pendurou uma lâmpada no teto.",
    "I shot a look in the referee's direction, but he was putting on a calm face while picking his nose. \"Dammit, the fight's a fixup!?\"": "Lancei um olhar para o árbitro, mas ele fingia tranquilidade enquanto cutucava o nariz. \"Droga, a luta foi armada?!\"",
    "A cat is peeking from behind the box.": "Um gato está espiando por trás da caixa.",
    "It is getting rather late. I think I must be going now.": "Está ficando bem tarde. Acho que preciso ir.",
    "You should apologize for your rudeness.": "Você deveria se desculpar pela sua grosseria.",
    "The girl played the baby to her mother.": "A garota se fez de bebê para a mãe.",
    "You have to pace yourself or you'll choke halfway through.": "Você precisa se controlar, ou vai engasgar no meio.",
    "All you have to do is write it down.": "Você só precisa anotar.",
    "I want to help you fulfill your dreams.": "Quero ajudar você a realizar seus sonhos.",
    "Peter fell in love with the girl.": "Peter se apaixonou pela garota.",
    "You've spilt your coffee.": "Você derramou seu café.",
    "The lamp hung from the ceiling.": "A lâmpada estava pendurada no teto.",
    "That custom is on the decrease.": "Esse costume está caindo em desuso.",
    "Water is dripping from the wet towel.": "A água está pingando da toalha molhada.",
    "I propped up the ceiling with a pole.": "Apoiei o teto com uma vara.",
    "He was muttering to himself.": "Ele estava murmurando sozinho.",
    "Turn your misfortune to account.": "Transforme o infortúnio em oportunidade.",
    "The city is cracking down on drunk drivers and giving them fines.": "A cidade está reprimindo motoristas bêbados e aplicando multas.",
    "I think your theory does not hold water.": "Acho que sua teoria não se sustenta.",
    "Your problem and mine are similar.": "Seu problema e o meu são parecidos.",
    "You must build up your courage.": "Você precisa criar coragem.",
    "The president is getting into the car.": "O presidente está entrando no carro.",
    "I am working with them towards world peace.": "Estou trabalhando com eles em prol da paz mundial.",
    "The paint was coming off the wall.": "A tinta estava descascando da parede.",
    "You must perform your duty.": "Você precisa cumprir seu dever.",
    "I think you have the wrong number.": "Acho que você está com o número errado.",
    "I hope the wine is to your taste.": "Espero que o vinho seja do seu agrado.",
    "They are arguing about their share of the property.": "Eles estão discutindo sobre a parte de cada um na propriedade.",
    "A strong yen is shaking the economy.": "Um iene forte está abalando a economia.",
    "Point your finger at your choice.": "Aponte para sua escolha.",
    "Then, the train screeched to a halt.": "Então, o trem freou bruscamente até parar.",
    "I'm catching the 11:00 train.": "Vou pegar o trem das 11h.",
    "I'd rather walk than wait for the next bus.": "Prefiro ir a pé a esperar o próximo ônibus.",
    "The train is very crowded this evening.": "O trem está muito lotado esta noite.",
    "Change trains at Tokyo Station.": "Faça baldeação na Estação de Tóquio.",
    "Hurry up in order to catch the train.": "Ande logo para não perder o trem.",
    "This type of mobile phone sells well.": "Este tipo de celular vende bem.",
    "Actions speak louder than words.": "As ações falam mais alto que as palavras.",
    "I recommend you to go by train.": "Recomendo que você vá de trem.",
    "This sweater is all stretched out of shape.": "Este suéter está todo deformado.",
    "It must have been difficult for her to knit this sweater.": "Deve ter sido difícil para ela tricotar este suéter.",
    "I was late for the bus, late for work, and got a run in my stocking.": "Perdi o ônibus, me atrasei para o trabalho e ainda desfiei a meia-calça.",
    "The invasion of other countries is a shameful action.": "Invadir outros países é uma ação vergonhosa.",
    "The accident delayed the train's arrival.": "O acidente atrasou a chegada do trem.",
    "It is strange that a cameraman heading for a war-zone should not know about the danger of unexploded shells. The newspaper company is being negligent in its training.": "É estranho que um cinegrafista a caminho de uma zona de guerra não conheça o perigo de projéteis não detonados. A empresa jornalística está sendo negligente no treinamento.",
    "The vegetables in the refrigerator wilted.": "Os legumes na geladeira murcharam.",
    "I don't want to rush you, but let's try to catch the next bus.": "Não quero apressar você, mas vamos tentar pegar o próximo ônibus.",
    "The sweater shrank a little when I washed it.": "O suéter encolheu um pouco quando o lavei.",
    "I complained, but they refused to take this sweater back.": "Reclamei, mas se recusaram a aceitar a devolução deste suéter.",
    "I caught my sweater on that nail.": "Prendi meu suéter naquele prego.",
    "His project was funded by grants.": "O projeto dele foi financiado por subsídios.",
}

PT_BR_WORDS = {
    "rapariga": "garota",
    "raparigas": "garotas",
    "autocarro": "ônibus",
    "autocarros": "ônibus",
    "comboio": "trem",
    "comboios": "trens",
    "telemóvel": "celular",
    "telemóveis": "celulares",
    "equipa": "equipe",
    "equipas": "equipes",
    "projecto": "projeto",
    "projectos": "projetos",
    "direcção": "direção",
    "direcções": "direções",
    "acção": "ação",
    "acções": "ações",
    "tecto": "teto",
    "tectos": "tetos",
    "frigorífico": "geladeira",
    "frigoríficos": "geladeiras",
    "boleia": "carona",
    "boleias": "caronas",
}

JP_MEANING_OVERRIDES = {
    "to become used to seeing; to be familiar with": "見ることに慣れる；見覚えがある",
    "to behave like a spoiled child; to fawn on": "甘やかされた子供のように振る舞う；人に頼る；こびる",
    "to become weak; to decline; to wear; to abate; to decay; to wither; to waste away": "弱くなる；衰退する；勢いが落ちる；しおれる",
    "to become settled; to be fixed": "決まる；確定する",
    "to become dim; to become blurred": "ぼんやりする；不鮮明になる",
}


def localize_pt_br(text: str, source_en: str = "", *, gloss: bool = False) -> str:
    if source_en in PT_BR_OVERRIDES:
        return PT_BR_OVERRIDES[source_en]

    result = text
    for old, new in PT_BR_WORDS.items():
        pattern = re.compile(rf"\b{re.escape(old)}\b", re.IGNORECASE)

        def replace(match: re.Match[str], replacement: str = new) -> str:
            value = match.group(0)
            if value.isupper():
                return replacement.upper()
            if value[:1].isupper():
                return replacement[:1].upper() + replacement[1:]
            return replacement

        result = pattern.sub(replace, result)
    if gloss:
        result = re.sub(r"(^|;\s*)para\s+", r"\1", result, flags=re.IGNORECASE)
        result = re.sub(r"(^|;\s*)a\s+ser\s+", r"\1ser ", result, flags=re.IGNORECASE)
    return result


def normalize(value: str) -> str:
    return unicodedata.normalize("NFKC", (value or "").strip())


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stem_english(token: str) -> str:
    irregular = {
        "became": "become", "brought": "bring", "came": "come",
        "did": "do", "done": "do", "gave": "give", "given": "give",
        "gone": "go", "had": "have", "held": "hold", "made": "make",
        "ran": "run", "said": "say", "saw": "see", "took": "take",
        "went": "go",
    }
    if token in irregular:
        return irregular[token]
    if len(token) > 5 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 5 and token.endswith("ing"):
        base = token[:-3]
        return base[:-1] if len(base) > 2 and base[-1] == base[-2] else base
    if len(token) > 4 and token.endswith("ed"):
        base = token[:-2]
        return base[:-1] + "y" if base.endswith("i") else base
    if len(token) > 4 and token.endswith("es"):
        return token[:-2]
    if len(token) > 3 and token.endswith("s"):
        return token[:-1]
    return token


def content_tokens(text: str) -> set[str]:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return {
        stem_english(token)
        for token in WORD_RE.findall(ascii_text.lower())
        if token not in STOPWORDS
    }


def sentence_semantic_score(sentence_en: str, meanings: list[str]) -> int:
    target = set().union(*(content_tokens(meaning) for meaning in meanings))
    candidate = content_tokens(sentence_en)
    overlap = target.intersection(candidate)
    return len(overlap) * 100


def candidate_key(candidate: dict[str, Any]) -> tuple[str, str]:
    return normalize(candidate.get("ja", "")), candidate.get("en", "").strip()


def example_anchor(entry: dict[str, Any]) -> str:
    word = normalize(entry["word"])
    if word.endswith("する") and len(word) > 2:
        return word[:-2]
    if word.endswith("ずる") and len(word) > 2:
        return word[:-2]
    if word[-1:] in "うくぐすつぬぶむる" and len(word) > 2:
        return word[:-1]
    return word


def contains_target(candidate_ja: str, entry: dict[str, Any]) -> bool:
    sentence = normalize(candidate_ja)
    word = normalize(entry["word"])
    lookup = normalize(entry.get("lookup_word", word))
    anchor = example_anchor(entry)
    return any(value and value in sentence for value in (word, lookup, anchor))


def infer_role(candidate: dict[str, Any], entry: dict[str, Any]) -> str | None:
    tagged = candidate.get("transitivity")
    if tagged in {"transitive", "intransitive"}:
        return tagged

    sentence = normalize(candidate.get("ja", ""))
    anchor = example_anchor(entry)
    index = sentence.find(anchor)
    prefix = sentence[:index] if index >= 0 else sentence
    clause = re.split(r"[。！？、]", prefix)[-1]

    # In a pair exercise, an explicit object is the strongest readable cue.
    if "を" in clause:
        return "transitive"
    # Quoted content commonly supplies the complement of speech/thought verbs.
    if "と" in clause and any(
        marker in entry["meanings_openjlpt_en"][0].lower()
        for marker in ("talk", "say", "mutter", "murmur", "lament", "repeat")
    ):
        return "transitive"
    return "intransitive"


def load_tatoeba(path: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            parts = line.rstrip("\n").split("\t", 2)
            if len(parts) < 2:
                continue
            source_id = ""
            if len(parts) == 3:
                matches = re.findall(r"#(\d+)", parts[2])
                source_id = matches[-1] if matches else ""
            rows.append({"en": parts[0].strip(), "ja": normalize(parts[1]), "source_id": source_id})
    return rows


def tatoeba_candidates(
    entry: dict[str, Any], corpus: list[dict[str, str]], limit: int = 80
) -> list[dict[str, Any]]:
    anchor = example_anchor(entry)
    if len(anchor) < 2:
        anchor = normalize(entry["word"])
    candidates: list[dict[str, Any]] = []
    for row in corpus:
        if anchor not in row["ja"]:
            continue
        if not (4 <= len(row["ja"]) <= 72 and 3 <= len(row["en"]) <= 180):
            continue
        candidates.append(
            {
                "ja": row["ja"],
                "en": row["en"],
                "source": "Tatoeba",
                "source_id": row["source_id"],
                "transitivity": "unknown",
                "selection_method": "tatoeba_anchor_match",
            }
        )
        if len(candidates) >= limit:
            break
    return candidates


def source_candidates(entry: dict[str, Any]) -> list[dict[str, Any]]:
    selection = entry["jlpt_sense_selection"]
    selected_keys = {
        (str(sense["jmdict_sequence"]), int(sense["sense_index"]))
        for sense in selection["selected_senses"]
    }
    candidates: list[dict[str, Any]] = []
    for example in selection.get("selected_jmdict_examples", []):
        item = dict(example)
        item["selection_method"] = "jmdict_selected_sense"
        candidates.append(item)
    for example in entry.get("jmdict_examples", []):
        key = (str(example.get("jmdict_sequence", "")), int(example.get("sense_index", -1)))
        item = dict(example)
        item["selection_method"] = (
            "jmdict_selected_sense" if key in selected_keys else "jmdict_related_sense"
        )
        candidates.append(item)
    for example in entry.get("openjlpt_examples", []):
        item = dict(example)
        item["selection_method"] = "openjlpt_example"
        candidates.append(item)
    for example in entry.get("_manual_examples", []):
        item = dict(example)
        item.setdefault("source", "Curadoria editorial (OpenJLPT + JMdict)")
        item.setdefault("source_id", "")
        item["transitivity"] = item["role"]
        item["selection_method"] = "manual_curated_from_dictionary_sense"
        candidates.append(item)

    deduplicated: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for candidate in candidates:
        key = candidate_key(candidate)
        if not key[0] or key in seen:
            continue
        seen.add(key)
        deduplicated.append(candidate)
    return deduplicated


def rank_candidate(
    candidate: dict[str, Any], entry: dict[str, Any], desired_role: str
) -> tuple[int, int, int, int, str]:
    method = candidate.get("selection_method", "")
    method_score = {
        "jmdict_selected_sense": 500,
        "openjlpt_example": 360,
        "jmdict_related_sense": 320,
        "tatoeba_anchor_match": 180,
        "manual_curated_from_dictionary_sense": 700,
    }.get(method, 0)
    inferred = infer_role(candidate, entry)
    role_score = 500 if inferred == desired_role else -600
    semantic = sentence_semantic_score(candidate.get("en", ""), entry["meanings_openjlpt_en"])
    target_score = 80 if contains_target(candidate.get("ja", ""), entry) else -120
    brevity = -abs(len(candidate.get("ja", "")) - 22)
    return (
        role_score + method_score + semantic + target_score + brevity,
        semantic,
        target_score,
        -len(candidate.get("ja", "")),
        candidate.get("ja", ""),
    )


def pick_examples(
    entry: dict[str, Any], corpus: list[dict[str, str]] | None
) -> list[dict[str, Any]]:
    classification = entry["jlpt_sense_classification"]
    desired_roles = (
        ["transitive", "intransitive"]
        if classification == "both"
        else [classification]
    )
    candidates = source_candidates(entry)
    needs_extra = any(
        not any(infer_role(candidate, entry) == role for candidate in candidates)
        for role in desired_roles
    )
    if needs_extra and corpus is not None:
        candidates.extend(tatoeba_candidates(entry, corpus))

    selected: list[dict[str, Any]] = []
    used: set[tuple[str, str]] = set()
    for role in desired_roles:
        eligible = [
            candidate
            for candidate in candidates
            if candidate_key(candidate) not in used
            and infer_role(candidate, entry) == role
        ]
        if not eligible:
            raise RuntimeError(f"Sem exemplo {role}: {entry['display']}")
        chosen = max(eligible, key=lambda item: rank_candidate(item, entry, role))
        used.add(candidate_key(chosen))
        selected.append(
            {
                "role": role,
                "ja": normalize(chosen["ja"]),
                "en": chosen.get("en", "").strip(),
                "source": chosen.get("source", "Tatoeba"),
                "source_id": str(chosen.get("source_id", "")),
                "jmdict_sequence": str(chosen.get("jmdict_sequence", "")),
                "sense_index": chosen.get("sense_index"),
                "selection_method": chosen.get("selection_method", "unknown"),
            }
        )
    return selected


class Translator:
    def __init__(self, cache_path: Path, enabled: bool):
        self.cache_path = cache_path
        self.enabled = enabled
        self.cache = (
            json.loads(cache_path.read_text(encoding="utf-8"))
            if cache_path.exists()
            else {}
        )
        self.translate_module = None
        self.new_translations = 0
        if enabled:
            from argostranslate import translate

            self.translate_module = translate

    def translate(self, text: str, target: str) -> str:
        text = " ".join((text or "").split())
        key = f"en->{target}\n{text}"
        if key in self.cache:
            return self.cache[key]
        if not self.enabled:
            return text
        assert self.translate_module is not None
        translated = self.translate_module.translate(text, "en", target).strip()
        if not translated:
            raise RuntimeError(f"Tradução vazia en->{target}: {text}")
        self.cache[key] = translated
        self.new_translations += 1
        if self.new_translations % 100 == 0:
            self.save()
            print(
                f"Traduções novas concluídas: {self.new_translations}",
                flush=True,
            )
        return translated

    def save(self) -> None:
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(
            json.dumps(self.cache, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )


def explanation(classification: str) -> tuple[str, str]:
    if classification == "transitive":
        return (
            "Neste sentido do JLPT, é transitivo: a ação recai sobre um objeto, geralmente marcado por を.",
            "このJLPTの意味では他動詞です。動作の対象を取り、多くの場合「を」で示します。",
        )
    if classification == "intransitive":
        return (
            "Neste sentido do JLPT, é intransitivo: descreve uma ação, mudança ou estado sem objeto direto.",
            "このJLPTの意味では自動詞です。直接目的語を取らず、動作・変化・状態を表します。",
        )
    return (
        "Depende do sentido e da construção: pode funcionar como transitivo ou intransitivo. Os exemplos mostram os dois usos.",
        "意味や文型によって他動詞にも自動詞にもなります。例文で両方の使い方を示します。",
    )


def build_record(
    entry: dict[str, Any], examples: list[dict[str, Any]], translator: Translator
) -> dict[str, Any]:
    meaning_en = "; ".join(entry["meanings_openjlpt_en"])
    meaning_pt = localize_pt_br(
        translator.translate(meaning_en, "pt"), meaning_en, gloss=True
    )
    meaning_ja = JP_MEANING_OVERRIDES.get(
        meaning_en, translator.translate(meaning_en, "ja")
    )
    for example in examples:
        example["pt"] = localize_pt_br(
            translator.translate(example["en"], "pt"), example["en"]
        )
    explanation_pt, explanation_ja = explanation(entry["jlpt_sense_classification"])
    selection = entry["jlpt_sense_selection"]
    return {
        "word": entry["word"],
        "reading": entry["reading"],
        "display": entry["display"],
        "jlpt_level": entry["jlpt_level"],
        "classification": PUBLIC_CLASSIFICATION[entry["jlpt_sense_classification"]],
        "meaning_pt": meaning_pt,
        "meaning_ja": meaning_ja,
        "meanings_en": entry["meanings_openjlpt_en"],
        "explanation_pt": explanation_pt,
        "explanation_ja": explanation_ja,
        "examples": examples,
        "source_data": {
            "sources": TRANSITIVITY_SOURCE,
            "listed_levels": entry["listed_levels"],
            "jmdict_sequences": entry["jmdict_sequences"],
            "selected_senses": selection["selected_senses"],
            "secondary_senses_retained": len(selection["secondary_senses_for_explanation"]),
            "classification_method": "OpenJLPT meaning aligned to JMdict sense-level vt/vi tags",
            "meaning_translation": "Google Translate en->pt/ja + deterministic pt-BR editorial localization",
            "automatic_classification": entry.get(
                "_automatic_classification", entry["jlpt_sense_classification"]
            ),
            "curation_override": entry.get("_curation_override"),
        },
    }


def create_table(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        DROP TABLE IF EXISTS transitivity_verbs;
        CREATE TABLE transitivity_verbs (
            id INTEGER PRIMARY KEY,
            word TEXT NOT NULL,
            reading TEXT NOT NULL,
            display TEXT NOT NULL,
            jlpt_level TEXT NOT NULL CHECK (jlpt_level IN ('N5','N4','N3','N2','N1')),
            classification TEXT NOT NULL CHECK (classification IN ('transitive','intransitive','depends')),
            meaning_pt TEXT NOT NULL,
            meaning_ja TEXT NOT NULL,
            meanings_en TEXT NOT NULL CHECK (json_valid(meanings_en)),
            explanation_pt TEXT NOT NULL,
            explanation_ja TEXT NOT NULL,
            examples TEXT NOT NULL CHECK (json_valid(examples)),
            source_data TEXT NOT NULL CHECK (json_valid(source_data)),
            UNIQUE (word, reading)
        );
        CREATE INDEX idx_transitivity_verbs_jlpt_level
            ON transitivity_verbs(jlpt_level);
        CREATE INDEX idx_transitivity_verbs_classification
            ON transitivity_verbs(classification);
        CREATE INDEX idx_transitivity_verbs_level_classification
            ON transitivity_verbs(jlpt_level, classification);
        """
    )


def write_database(
    source_db: Path,
    output_db: Path,
    records: list[dict[str, Any]],
    source_artifact: Path,
    excluded_candidates: int,
) -> None:
    output_db.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_db, output_db)
    connection = sqlite3.connect(output_db)
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        with connection:
            create_table(connection)
            connection.executemany(
                """
                INSERT INTO transitivity_verbs (
                    id, word, reading, display, jlpt_level, classification,
                    meaning_pt, meaning_ja, meanings_en, explanation_pt,
                    explanation_ja, examples, source_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        index,
                        record["word"],
                        record["reading"],
                        record["display"],
                        record["jlpt_level"],
                        record["classification"],
                        record["meaning_pt"],
                        record["meaning_ja"],
                        json.dumps(record["meanings_en"], ensure_ascii=False),
                        record["explanation_pt"],
                        record["explanation_ja"],
                        json.dumps(record["examples"], ensure_ascii=False),
                        json.dumps(record["source_data"], ensure_ascii=False),
                    )
                    for index, record in enumerate(records, 1)
                ],
            )
            metadata = {
                "transitivity_schema_version": "1",
                "transitivity_generated_at": datetime.now(timezone.utc).isoformat(),
                "transitivity_rows": str(len(records)),
                "transitivity_excluded_candidates": str(excluded_candidates),
                "transitivity_source_artifact": source_artifact.name,
                "transitivity_source_sha256": sha256_file(source_artifact),
                "transitivity_sources": json.dumps(TRANSITIVITY_SOURCE, ensure_ascii=False),
            }
            connection.executemany(
                "INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)",
                metadata.items(),
            )
            connection.execute("PRAGMA optimize")
    finally:
        connection.close()


def validate_records(records: list[dict[str, Any]]) -> None:
    if len(records) != 1398:
        raise RuntimeError(f"Esperadas 1.398 entradas, obtidas {len(records)}")
    keys = [(record["word"], record["reading"]) for record in records]
    if len(keys) != len(set(keys)):
        raise RuntimeError("Há pares word+reading duplicados")
    for record in records:
        if not record["meaning_pt"] or not record["meaning_ja"]:
            raise RuntimeError(f"Significado vazio: {record['display']}")
        roles = {example["role"] for example in record["examples"]}
        required = (
            {"transitive", "intransitive"}
            if record["classification"] == "depends"
            else {record["classification"]}
        )
        if not required.issubset(roles):
            raise RuntimeError(
                f"Exemplos incompletos em {record['display']}: {roles}"
            )
        if any(not example["ja"] or not example["pt"] for example in record["examples"]):
            raise RuntimeError(f"Exemplo sem JA/PT: {record['display']}")


def write_report(
    path: Path,
    records: list[dict[str, Any]],
    output_db: Path,
    source_db: Path,
    formerly_missing: int,
    excluded_candidates: int,
) -> None:
    classification_counts = Counter(record["classification"] for record in records)
    level_counts = {
        level: Counter(
            record["classification"]
            for record in records
            if record["jlpt_level"] == level
        )
        for level in LEVELS
    }
    source_counts = Counter(
        example["source"]
        for record in records
        for example in record["examples"]
    )
    method_counts = Counter(
        example["selection_method"]
        for record in records
        for example in record["examples"]
    )
    depends_samples = [
        {
            "display": record["display"],
            "examples": record["examples"],
        }
        for record in records
        if record["classification"] == "depends"
    ]
    report = {
        "status": "complete",
        "database_modified": True,
        "interface_modified": False,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_database": source_db.name,
        "output_database": output_db.name,
        "output_sha256": sha256_file(output_db),
        "total_entries": len(records),
        "classification_counts": dict(classification_counts),
        "by_level": {
            level: {
                "transitive": level_counts[level]["transitive"],
                "intransitive": level_counts[level]["intransitive"],
                "depends": level_counts[level]["depends"],
                "total": sum(level_counts[level].values()),
            }
            for level in LEVELS
        },
        "formerly_missing_examples_resolved": formerly_missing,
        "excluded_unresolved_candidates": excluded_candidates,
        "example_source_counts": dict(source_counts),
        "example_selection_method_counts": dict(method_counts),
        "depends_entries": depends_samples,
    }
    path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--entries",
        type=Path,
        default=Path("artifacts/transitivity-jlpt-sense.entries.json"),
    )
    parser.add_argument(
        "--source-db",
        type=Path,
        default=Path("artifacts/kanji database 1 - openjlpt-onomatopoeia.db"),
    )
    parser.add_argument(
        "--output-db",
        type=Path,
        default=Path(
            "artifacts/kanji database 1 - openjlpt-onomatopoeia-transitivity.db"
        ),
    )
    parser.add_argument(
        "--tatoeba",
        type=Path,
        default=Path("data/tatoeba-jpn-eng/jpn.txt"),
    )
    parser.add_argument(
        "--translation-cache",
        type=Path,
        default=Path("data/transitivity-translation-cache.json"),
    )
    parser.add_argument(
        "--curation",
        type=Path,
        default=Path("data/transitivity-curation.json"),
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("artifacts/transitivity-database.report.json"),
    )
    parser.add_argument("--no-translate", action="store_true")
    parser.add_argument("--selection-only", action="store_true")
    args = parser.parse_args()

    payload = json.loads(args.entries.read_text(encoding="utf-8"))
    all_entries = payload["entries"]
    entries = [
        entry
        for entry in all_entries
        if entry.get("jlpt_sense_classification") in CLASSIFICATIONS
    ]
    curation = json.loads(args.curation.read_text(encoding="utf-8"))
    overrides = curation.get("classification_overrides", {})
    manual_by_key: dict[str, list[dict[str, Any]]] = {}
    for example in curation.get("examples", []):
        key = f"{example['word']}|{example['reading']}"
        manual_by_key.setdefault(key, []).append(example)
    for entry in entries:
        key = f"{entry['word']}|{entry['reading']}"
        entry["_automatic_classification"] = entry["jlpt_sense_classification"]
        if key in overrides:
            override = overrides[key]
            classification = override["classification"]
            if classification not in CLASSIFICATIONS:
                raise RuntimeError(f"Classificação manual inválida em {key}")
            entry["jlpt_sense_classification"] = classification
            entry["_curation_override"] = override
        entry["_manual_examples"] = manual_by_key.get(key, [])
    entries.sort(
        key=lambda entry: (
            LEVEL_RANK[entry["jlpt_level"]],
            entry["reading"],
            entry["word"],
        )
    )
    formerly_missing = sum(
        bool(
            entry["jlpt_sense_selection"]["example_audit"].get(
                "needs_curated_examples"
            )
        )
        for entry in entries
    )
    excluded_candidates = sum(
        entry.get("classification")
        in {
            "kana_homograph_review",
            "no_jmdict_match",
            "verb_without_transitivity_tag",
            "matched_nonverb",
        }
        for entry in all_entries
    )

    corpus: list[dict[str, str]] | None = None
    selections: dict[tuple[str, str], list[dict[str, Any]]] = {}
    unresolved: list[str] = []
    for entry in entries:
        try:
            selected = pick_examples(entry, corpus)
        except RuntimeError:
            if corpus is None:
                corpus = load_tatoeba(args.tatoeba)
            try:
                selected = pick_examples(entry, corpus)
            except RuntimeError as error:
                unresolved.append(str(error))
                continue
        selections[(entry["word"], entry["reading"])] = selected

    if unresolved:
        print("\n".join(unresolved), file=sys.stderr)
        raise SystemExit(f"{len(unresolved)} entradas continuam sem exemplos")

    if args.selection_only:
        print(
            json.dumps(
                {
                    "entries": len(entries),
                    "formerly_missing": formerly_missing,
                    "examples": sum(len(value) for value in selections.values()),
                    "sources": dict(
                        Counter(
                            example["source"]
                            for value in selections.values()
                            for example in value
                        )
                    ),
                    "methods": dict(
                        Counter(
                            example["selection_method"]
                            for value in selections.values()
                            for example in value
                        )
                    ),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    translator = Translator(args.translation_cache, enabled=not args.no_translate)
    records = [
        build_record(
            entry,
            selections[(entry["word"], entry["reading"])],
            translator,
        )
        for entry in entries
    ]
    validate_records(records)
    translator.save()
    write_database(
        args.source_db,
        args.output_db,
        records,
        args.entries,
        excluded_candidates,
    )
    write_report(
        args.report,
        records,
        args.output_db,
        args.source_db,
        formerly_missing,
        excluded_candidates,
    )
    print(
        json.dumps(
            {
                "database": str(args.output_db),
                "sha256": sha256_file(args.output_db),
                "records": len(records),
                "formerly_missing_resolved": formerly_missing,
                "excluded_candidates": excluded_candidates,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
