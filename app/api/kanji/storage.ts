import { env } from 'cloudflare:workers';
import type { AnswerResult, PersistedKanjiProgress } from '@/app/treino/kanji/deck';
import type {
  KanjiCatalogResponse,
  KanjiGrouping,
  KanjiRecord,
  KanjiSessionView,
} from '@/app/treino/kanji/contracts';
import {
  calculateAnsweredProgress,
  drawWeightedCandidate,
  KanjiApiError,
  type WeightedCandidate,
} from './logic';

type KanjiRow = {
  id: number;
  character: string;
  meaning_pt: string;
  onyomi: string | null;
  kunyomi: string | null;
  grade: number;
  jlpt_level: string | null;
};

type CandidateRow = {
  id: number;
  copies: number;
  last_result: AnswerResult | null;
  streak: number;
};

type SessionRow = CandidateRow & {
  session_id: string;
  grouping: KanjiGrouping;
  level: string;
  selected_ids_json: string;
  selected_count: number;
  turn: number;
  current_kanji_id: number;
};

export type ImportedProgress = {
  kanjiId: number;
  copies: number;
  lastResult: AnswerResult | null;
  streak: number;
};

function getDatabase() {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) throw new KanjiApiError(503, 'database_unavailable', 'O banco do treino não está disponível.');
  return database;
}

function mapKanji(row: KanjiRow): KanjiRecord {
  return {
    id: row.id,
    kanji: row.character,
    meaning: row.meaning_pt,
    onyomi: row.onyomi,
    kunyomi: row.kunyomi,
    grade: row.grade,
    jlpt: row.jlpt_level,
  };
}

function mapProgress(row: CandidateRow): PersistedKanjiProgress {
  return {
    copies: Number(row.copies),
    lastResult: row.last_result,
    streak: Number(row.streak),
  };
}

function mapSession(row: SessionRow): KanjiSessionView {
  return {
    sessionId: row.session_id,
    grouping: row.grouping,
    level: row.level,
    selectedCount: Number(row.selected_count),
    turn: Number(row.turn),
    currentId: Number(row.current_kanji_id),
    progress: mapProgress(row),
  };
}

export async function loadKanjiCatalog(): Promise<KanjiCatalogResponse> {
  const database = getDatabase();
  const result = await database.prepare(`
    SELECT id, character, meaning_pt, onyomi, kunyomi, grade, jlpt_level
    FROM kanji_catalog
    ORDER BY id
  `).all<KanjiRow>();

  return {
    version: 2,
    count: result.results.length,
    kanji: result.results.map(mapKanji),
  };
}

async function loadLevelIds(grouping: KanjiGrouping, level: string) {
  const database = getDatabase();
  const statement = grouping === 'jlpt'
    ? database.prepare('SELECT id FROM kanji_catalog WHERE jlpt_level = ? ORDER BY id').bind(level)
    : database.prepare('SELECT id FROM kanji_catalog WHERE grade = ? ORDER BY id').bind(Number(level));
  const result = await statement.all<{ id: number }>();
  return result.results.map((row) => Number(row.id));
}

async function loadCandidates(
  learnerId: string,
  selectedIdsJson: string,
  cooldown?: { sessionId: string; turn: number },
) {
  const database = getDatabase();
  const statement = cooldown
    ? database.prepare(`
        SELECT
          CAST(selected.value AS INTEGER) AS id,
          COALESCE(progress.copies, 3) AS copies,
          progress.last_result,
          COALESCE(progress.streak, 0) AS streak
        FROM json_each(?) AS selected
        LEFT JOIN learner_kanji_progress AS progress
          ON progress.learner_id = ?
         AND progress.kanji_id = CAST(selected.value AS INTEGER)
        LEFT JOIN kanji_session_cooldowns AS cooldown
          ON cooldown.session_id = ?
         AND cooldown.kanji_id = CAST(selected.value AS INTEGER)
        WHERE COALESCE(cooldown.blocked_until_turn, -1) < ?
        ORDER BY CAST(selected.value AS INTEGER)
      `).bind(selectedIdsJson, learnerId, cooldown.sessionId, cooldown.turn)
    : database.prepare(`
        SELECT
          CAST(selected.value AS INTEGER) AS id,
          COALESCE(progress.copies, 3) AS copies,
          progress.last_result,
          COALESCE(progress.streak, 0) AS streak
        FROM json_each(?) AS selected
        LEFT JOIN learner_kanji_progress AS progress
          ON progress.learner_id = ?
         AND progress.kanji_id = CAST(selected.value AS INTEGER)
        ORDER BY CAST(selected.value AS INTEGER)
      `).bind(selectedIdsJson, learnerId);

  const result = await statement.all<CandidateRow>();
  return result.results.map((row) => ({ id: Number(row.id), ...mapProgress(row) }));
}

export async function getKanjiSession(learnerId: string, sessionId: string) {
  if (!/^[0-9a-f-]{36}$/.test(sessionId)) return null;
  const database = getDatabase();
  const row = await database.prepare(`
    SELECT
      session.id AS session_id,
      session.grouping,
      session.level,
      session.selected_ids_json,
      session.selected_count,
      session.turn,
      session.current_kanji_id,
      session.current_kanji_id AS id,
      COALESCE(progress.copies, 3) AS copies,
      progress.last_result,
      COALESCE(progress.streak, 0) AS streak
    FROM kanji_practice_sessions AS session
    LEFT JOIN learner_kanji_progress AS progress
      ON progress.learner_id = session.learner_id
     AND progress.kanji_id = session.current_kanji_id
    WHERE session.id = ?
      AND session.learner_id = ?
      AND session.status = 'active'
      AND session.current_kanji_id IS NOT NULL
    LIMIT 1
  `).bind(sessionId, learnerId).first<SessionRow>();

  return row ? mapSession(row) : null;
}

export async function startKanjiSession(
  learnerId: string,
  grouping: KanjiGrouping,
  level: string,
  requestedIds?: number[],
) {
  const levelIds = await loadLevelIds(grouping, level);
  const allowed = new Set(levelIds);
  const selectedIds = requestedIds === undefined
    ? levelIds
    : requestedIds.filter((id) => allowed.has(id));

  if (selectedIds.length < 3) {
    throw new KanjiApiError(400, 'selection_too_small', 'Selecione pelo menos 3 kanjis.');
  }

  const database = getDatabase();
  const sessionId = crypto.randomUUID();
  const selectedIdsJson = JSON.stringify(selectedIds);
  const first = drawWeightedCandidate(await loadCandidates(learnerId, selectedIdsJson));

  await database.batch([
    database.prepare(`
      UPDATE kanji_practice_sessions
      SET status = 'abandoned', updated_at = CURRENT_TIMESTAMP
      WHERE learner_id = ? AND status = 'active'
    `).bind(learnerId),
    database.prepare(`
      INSERT INTO kanji_practice_sessions
        (id, learner_id, grouping, level, selected_ids_json, selected_count, turn, current_kanji_id, status)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'active')
    `).bind(sessionId, learnerId, grouping, level, selectedIdsJson, selectedIds.length, first.id),
    database.prepare(`
      INSERT INTO kanji_session_cooldowns (session_id, kanji_id, blocked_until_turn)
      VALUES (?, ?, 3)
    `).bind(sessionId, first.id),
  ]);

  const session = await getKanjiSession(learnerId, sessionId);
  if (!session) throw new KanjiApiError(500, 'session_creation_failed', 'Não foi possível abrir a sessão.');
  return session;
}

export async function answerKanjiSession(
  learnerId: string,
  sessionId: string,
  expectedTurn: number,
  expectedKanjiId: number,
  result: AnswerResult,
) {
  const database = getDatabase();
  const session = await database.prepare(`
    SELECT
      session.id AS session_id,
      session.grouping,
      session.level,
      session.selected_ids_json,
      session.selected_count,
      session.turn,
      session.current_kanji_id,
      session.current_kanji_id AS id,
      COALESCE(progress.copies, 3) AS copies,
      progress.last_result,
      COALESCE(progress.streak, 0) AS streak
    FROM kanji_practice_sessions AS session
    LEFT JOIN learner_kanji_progress AS progress
      ON progress.learner_id = session.learner_id
     AND progress.kanji_id = session.current_kanji_id
    WHERE session.id = ? AND session.learner_id = ? AND session.status = 'active'
    LIMIT 1
  `).bind(sessionId, learnerId).first<SessionRow>();

  if (!session) throw new KanjiApiError(404, 'session_not_found', 'Essa sessão não existe mais.');
  if (Number(session.turn) !== expectedTurn || Number(session.current_kanji_id) !== expectedKanjiId) {
    throw new KanjiApiError(409, 'stale_answer', 'Esta carta já foi respondida. Atualize a sessão.');
  }

  const before = mapProgress(session);
  const after = calculateAnsweredProgress(before, result);
  const nextTurn = expectedTurn + 1;
  const candidates = await loadCandidates(learnerId, session.selected_ids_json, {
    sessionId,
    turn: nextTurn,
  });
  const next = drawWeightedCandidate(candidates);
  const correctIncrement = result === 'correct' ? 1 : 0;
  const wrongIncrement = result === 'wrong' ? 1 : 0;

  await database.batch([
    database.prepare(`
      INSERT INTO kanji_practice_answers
        (session_id, learner_id, turn, kanji_id, result, copies_before, copies_after, streak_before, streak_after)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      sessionId,
      learnerId,
      expectedTurn,
      expectedKanjiId,
      result,
      before.copies,
      after.copies,
      before.streak,
      after.streak,
    ),
    database.prepare(`
      INSERT INTO learner_kanji_progress
        (learner_id, kanji_id, copies, last_result, streak, correct_count, wrong_count, last_seen_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (learner_id, kanji_id) DO UPDATE SET
        copies = excluded.copies,
        last_result = excluded.last_result,
        streak = excluded.streak,
        correct_count = learner_kanji_progress.correct_count + excluded.correct_count,
        wrong_count = learner_kanji_progress.wrong_count + excluded.wrong_count,
        last_seen_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      learnerId,
      expectedKanjiId,
      after.copies,
      after.lastResult,
      after.streak,
      correctIncrement,
      wrongIncrement,
    ),
    database.prepare(`
      UPDATE kanji_practice_sessions
      SET turn = ?, current_kanji_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND learner_id = ? AND turn = ? AND current_kanji_id = ? AND status = 'active'
    `).bind(nextTurn, next.id, sessionId, learnerId, expectedTurn, expectedKanjiId),
    database.prepare(`
      INSERT INTO kanji_session_cooldowns (session_id, kanji_id, blocked_until_turn)
      VALUES (?, ?, ?)
      ON CONFLICT (session_id, kanji_id) DO UPDATE SET blocked_until_turn = excluded.blocked_until_turn
    `).bind(sessionId, next.id, nextTurn + 2),
  ]);

  const updated = await getKanjiSession(learnerId, sessionId);
  if (!updated) throw new KanjiApiError(500, 'session_update_failed', 'A resposta foi salva, mas a próxima carta não abriu.');
  return updated;
}

export async function closeKanjiSession(learnerId: string, sessionId: string) {
  const database = getDatabase();
  const result = await database.prepare(`
    UPDATE kanji_practice_sessions
    SET status = 'completed', current_kanji_id = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND learner_id = ? AND status = 'active'
  `).bind(sessionId, learnerId).run();
  return Number(result.meta.changes) > 0;
}

export async function importLegacyKanjiProgress(learnerId: string, entries: ImportedProgress[]) {
  if (entries.length === 0) return 0;
  const database = getDatabase();
  const result = await database.prepare(`
    INSERT INTO learner_kanji_progress
      (learner_id, kanji_id, copies, last_result, streak, correct_count, wrong_count, updated_at)
    SELECT
      ?,
      CAST(json_extract(incoming.value, '$.kanjiId') AS INTEGER),
      CAST(json_extract(incoming.value, '$.copies') AS INTEGER),
      json_extract(incoming.value, '$.lastResult'),
      CAST(json_extract(incoming.value, '$.streak') AS INTEGER),
      0,
      0,
      CURRENT_TIMESTAMP
    FROM json_each(?) AS incoming
    JOIN kanji_catalog AS catalog
      ON catalog.id = CAST(json_extract(incoming.value, '$.kanjiId') AS INTEGER)
    WHERE 1 = 1
    ON CONFLICT (learner_id, kanji_id) DO NOTHING
  `).bind(learnerId, JSON.stringify(entries)).run();
  return Number(result.meta.changes);
}
