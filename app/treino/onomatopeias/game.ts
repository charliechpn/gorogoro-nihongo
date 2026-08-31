export type OnomatopoeiaEntry = {
  id: number;
  term: string;
  meaningPt: string;
  meaningJa: string;
  categories: string[];
};

export type MeaningChoice = {
  id: number;
  text: string;
  isCorrect: boolean;
};

function safeRandomIndex(length: number, random: () => number) {
  const value = Math.min(0.999999999999, Math.max(0, random()));
  return Math.floor(value * length);
}

function shuffled<T>(values: T[], random: () => number) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = safeRandomIndex(index + 1, random);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function createMeaningChoices(
  entries: OnomatopoeiaEntry[],
  currentId: number,
  random = Math.random,
): MeaningChoice[] {
  const current = entries.find((entry) => entry.id === currentId);
  if (!current) throw new Error(`Onomatopeia ${currentId} não encontrada.`);

  const seenMeanings = new Set([current.meaningPt]);
  const distractors = shuffled(
    entries.filter((entry) => entry.id !== currentId),
    random,
  ).filter((entry) => {
    if (seenMeanings.has(entry.meaningPt)) return false;
    seenMeanings.add(entry.meaningPt);
    return true;
  });

  if (distractors.length < 2) {
    throw new Error('São necessárias pelo menos três definições diferentes para o modo fácil.');
  }

  return shuffled(
    [
      { id: current.id, text: current.meaningPt, isCorrect: true },
      ...distractors.slice(0, 2).map((entry) => ({
        id: entry.id,
        text: entry.meaningPt,
        isCorrect: false,
      })),
    ],
    random,
  );
}
