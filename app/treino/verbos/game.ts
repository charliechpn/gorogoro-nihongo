export type TransitivityClassification = 'transitive' | 'intransitive' | 'depends';
export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

export type VerbExample = {
  role: Exclude<TransitivityClassification, 'depends'>;
  ja: string;
  pt: string;
};

export type TransitivityVerb = {
  id: number;
  word: string;
  reading: string;
  display: string;
  jlptLevel: JlptLevel;
  classification: TransitivityClassification;
  meaningPt: string;
  meaningJa: string;
  explanationPt: string;
  explanationJa: string;
  examples: VerbExample[];
};

export const CLASSIFICATION_LABELS: Record<TransitivityClassification, string> = {
  transitive: 'Transitivo',
  intransitive: 'Intransitivo',
  depends: 'Depende',
};

export function isCorrectClassification(
  verb: TransitivityVerb,
  answer: TransitivityClassification,
) {
  return verb.classification === answer;
}

export function verbsForLevel(verbs: TransitivityVerb[], level: JlptLevel) {
  return verbs.filter((verb) => verb.jlptLevel === level);
}
