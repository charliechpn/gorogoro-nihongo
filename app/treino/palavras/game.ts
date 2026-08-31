export type AnswerStatus = 'correct' | 'not-in-base' | 'missing-kanji';

export type GradedAnswer = {
  word: string;
  status: AnswerStatus;
  matches: string[];
};

export type GradedRound = {
  answers: GradedAnswer[];
  correctCount: number;
  notRecognizedCount: number;
  missingKanjiCount: number;
  duplicateCount: number;
};

type TokenizedAnswers = {
  words: string[];
  duplicateCount: number;
};

export function normalizeWord(value: string) {
  return value.normalize('NFKC').trim();
}

export function tokenizeAnswers(input: string): TokenizedAnswers {
  const pieces = input
    .normalize('NFKC')
    .split(/[\n\r、,;；]+/u)
    .map(normalizeWord)
    .filter(Boolean);

  const words: string[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;

  for (const word of pieces) {
    if (seen.has(word)) {
      duplicateCount += 1;
      continue;
    }

    seen.add(word);
    words.push(word);
  }

  return { words, duplicateCount };
}

export function surfaceFromFullWord(fullWord: string) {
  const openingParenthesis = fullWord.lastIndexOf('（');
  return openingParenthesis === -1 ? fullWord : fullWord.slice(0, openingParenthesis);
}

export function buildAcceptedWordMap(fullWords: string[]) {
  const accepted = new Map<string, string[]>();

  for (const fullWord of fullWords) {
    const surface = normalizeWord(surfaceFromFullWord(fullWord));
    const matches = accepted.get(surface) ?? [];
    if (!matches.includes(fullWord)) matches.push(fullWord);
    accepted.set(surface, matches);
  }

  return accepted;
}

export function gradeAnswers(
  targetKanji: string,
  input: string,
  fullWords: string[],
): GradedRound {
  const { words, duplicateCount } = tokenizeAnswers(input);
  const accepted = buildAcceptedWordMap(fullWords);
  const answers = words.map<GradedAnswer>((word) => {
    if (!word.includes(targetKanji)) {
      return { word, status: 'missing-kanji', matches: [] };
    }

    const matches = accepted.get(word) ?? [];
    return {
      word,
      status: matches.length ? 'correct' : 'not-in-base',
      matches,
    };
  });

  return {
    answers,
    correctCount: answers.filter((answer) => answer.status === 'correct').length,
    notRecognizedCount: answers.filter((answer) => answer.status === 'not-in-base').length,
    missingKanjiCount: answers.filter((answer) => answer.status === 'missing-kanji').length,
    duplicateCount,
  };
}

export function shuffleIds(ids: number[], random = Math.random) {
  const shuffled = [...ids];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const safeRandom = Math.min(0.999999999999, Math.max(0, random()));
    const swapIndex = Math.floor(safeRandom * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}
