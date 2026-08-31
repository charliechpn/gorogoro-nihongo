import { applyAnswer, type AnswerResult, type PersistedKanjiProgress } from '../../treino/kanji/deck.ts';
import type { KanjiGrouping } from '../../treino/kanji/contracts.ts';

export type WeightedCandidate = PersistedKanjiProgress & { id: number };

export class KanjiApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function resolveLearnerId(headers: Headers) {
  const authenticatedId = headers.get('oai-authenticated-user-id')?.trim();
  if (authenticatedId && authenticatedId.length <= 255) return `oai:${authenticatedId}`;

  const anonymousId = headers.get('x-nihongo-learner-id')?.trim().toLowerCase();
  if (anonymousId && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(anonymousId)) {
    return `anon:${anonymousId}`;
  }

  throw new KanjiApiError(401, 'learner_identity_required', 'Não foi possível identificar este estudante.');
}

export function validateGroupingAndLevel(grouping: unknown, level: unknown) {
  if (grouping !== 'jlpt' && grouping !== 'grade') {
    throw new KanjiApiError(400, 'invalid_grouping', 'O agrupamento precisa ser JLPT ou série escolar.');
  }

  if (typeof level !== 'string') {
    throw new KanjiApiError(400, 'invalid_level', 'Escolha um nível válido.');
  }

  const valid = grouping === 'jlpt'
    ? ['N5', 'N4', 'N3', 'N2', 'N1'].includes(level)
    : ['1', '2', '3', '4', '5', '6'].includes(level);

  if (!valid) throw new KanjiApiError(400, 'invalid_level', 'Escolha um nível válido.');
  return { grouping: grouping as KanjiGrouping, level };
}

export function sanitizeSelectedIds(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 1006) {
    throw new KanjiApiError(400, 'invalid_selection', 'A seleção avançada é inválida.');
  }

  return [...new Set(value.filter((id): id is number => Number.isInteger(id) && id > 0 && id <= 1006))];
}

export function drawWeightedCandidate(
  candidates: WeightedCandidate[],
  random = Math.random,
) {
  const totalCopies = candidates.reduce((sum, candidate) => sum + candidate.copies, 0);
  if (totalCopies < 1) {
    throw new KanjiApiError(409, 'empty_deck', 'Não existem kanjis disponíveis neste turno.');
  }

  const safeRandom = Math.min(0.999999999999, Math.max(0, random()));
  let ticket = Math.floor(safeRandom * totalCopies);

  for (const candidate of candidates) {
    if (ticket < candidate.copies) return candidate;
    ticket -= candidate.copies;
  }

  return candidates[candidates.length - 1];
}

export function calculateAnsweredProgress(
  progress: PersistedKanjiProgress,
  result: AnswerResult,
) {
  return applyAnswer(progress, result);
}

export function normalizeImportedProgress(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];

  return Object.entries(value)
    .slice(0, 1006)
    .flatMap(([rawId, rawProgress]) => {
      const kanjiId = Number(rawId);
      if (!Number.isInteger(kanjiId) || kanjiId < 1 || kanjiId > 1006 || !rawProgress || typeof rawProgress !== 'object') {
        return [];
      }

      const progress = rawProgress as Partial<PersistedKanjiProgress>;
      const copies = Number(progress.copies);
      const streak = progress.streak === 1 ? 1 : 0;
      const lastResult = progress.lastResult === 'correct' || progress.lastResult === 'wrong'
        ? progress.lastResult
        : null;

      if (!Number.isInteger(copies) || copies < 1 || copies > 8) return [];
      return [{ kanjiId, copies, streak, lastResult }];
    });
}
