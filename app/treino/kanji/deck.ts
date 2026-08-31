export type AnswerResult = 'correct' | 'wrong';

export type PersistedKanjiProgress = {
  copies: number;
  lastResult: AnswerResult | null;
  streak: number;
};

export type DeckEntry = PersistedKanjiProgress & {
  id: number;
  blockedUntilTurn: number;
};

export type DeckSession = {
  turn: number;
  entries: Record<number, DeckEntry>;
};

const INITIAL_COPIES = 3;
const MIN_COPIES = 1;
const MAX_COPIES = 8;

function clampCopies(value: number) {
  return Math.min(MAX_COPIES, Math.max(MIN_COPIES, value));
}

function normalizeProgress(progress?: Partial<PersistedKanjiProgress>): PersistedKanjiProgress {
  const lastResult = progress?.lastResult;

  return {
    copies: clampCopies(Number.isFinite(progress?.copies) ? Number(progress?.copies) : INITIAL_COPIES),
    lastResult: lastResult === 'correct' || lastResult === 'wrong' ? lastResult : null,
    streak: progress?.streak === 1 ? 1 : 0,
  };
}

export function createDeckSession(
  kanjiIds: number[],
  savedProgress: Record<number, PersistedKanjiProgress> = {},
): DeckSession {
  const entries = Object.fromEntries(
    kanjiIds.map((id) => [
      id,
      {
        id,
        ...normalizeProgress(savedProgress[id]),
        blockedUntilTurn: -1,
      },
    ]),
  );

  return { turn: 0, entries };
}

export function applyAnswer(
  progress: PersistedKanjiProgress,
  result: AnswerResult,
): PersistedKanjiProgress {
  const sameResult = progress.lastResult === result;
  const nextStreak = sameResult ? progress.streak + 1 : 1;

  if (nextStreak < 2) {
    return {
      copies: clampCopies(progress.copies),
      lastResult: result,
      streak: nextStreak,
    };
  }

  return {
    copies: clampCopies(progress.copies + (result === 'correct' ? -1 : 1)),
    lastResult: result,
    streak: 0,
  };
}

export function answerKanji(
  session: DeckSession,
  kanjiId: number,
  result: AnswerResult,
): DeckSession {
  const entry = session.entries[kanjiId];
  if (!entry) throw new Error(`Kanji ${kanjiId} não pertence a esta sessão.`);

  return {
    ...session,
    entries: {
      ...session.entries,
      [kanjiId]: {
        ...entry,
        ...applyAnswer(entry, result),
      },
    },
  };
}

export function buildAvailableCopyPool(session: DeckSession, turn = session.turn + 1) {
  return Object.values(session.entries).flatMap((entry) =>
    entry.blockedUntilTurn < turn ? Array.from({ length: entry.copies }, () => entry.id) : [],
  );
}

export function drawNextKanji(session: DeckSession, random = Math.random) {
  const turn = session.turn + 1;
  const pool = buildAvailableCopyPool(session, turn);

  if (pool.length === 0) {
    throw new Error('Não existem kanjis disponíveis neste turno. Selecione pelo menos 3 kanjis.');
  }

  const safeRandom = Math.min(0.999999999999, Math.max(0, random()));
  const kanjiId = pool[Math.floor(safeRandom * pool.length)];
  const entry = session.entries[kanjiId];

  return {
    kanjiId,
    session: {
      turn,
      entries: {
        ...session.entries,
        [kanjiId]: {
          ...entry,
          blockedUntilTurn: turn + 2,
        },
      },
    },
  };
}

export function extractPersistedProgress(session: DeckSession) {
  return Object.fromEntries(
    Object.values(session.entries).map(({ id, copies, lastResult, streak }) => [
      id,
      { copies, lastResult, streak },
    ]),
  ) as Record<number, PersistedKanjiProgress>;
}
