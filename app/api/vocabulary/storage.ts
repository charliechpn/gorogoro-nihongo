import { env } from 'cloudflare:workers';
import type { AnswerResult, PersistedKanjiProgress } from '@/app/treino/kanji/deck';
import type {
  VocabularyCatalogResponse,
  VocabularyDirection,
  VocabularyRecord,
  VocabularySessionView,
} from '@/app/treino/vocabulario/contracts';
import {
  calculateAnsweredProgress,
  drawWeightedCandidate,
  KanjiApiError,
} from '../kanji/logic';

type VocabularyRow = {
  id: number;
  word: string;
  reading: string;
  meanings_pt_json: string;
  jlpt_level: string;
};

type CandidateRow = {
  id: number;
  copies: number;
  last_result: AnswerResult | null;
  streak: number;
};

type SessionRow = CandidateRow & VocabularyRow & {
  session_id: string;
  level: string;
  direction: VocabularyDirection;
  show_furigana: number;
  selected_ids_json: string;
  selected_count: number;
  turn: number;
  current_vocabulary_id: number;
};

function getDatabase() {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) throw new KanjiApiError(503, 'database_unavailable', 'O banco do treino não está disponível.');
  return database;
}

function mapVocabulary(row: VocabularyRow): VocabularyRecord {
  return {
    id: Number(row.id),
    word: row.word,
    reading: row.reading,
    meaningsPt: JSON.parse(row.meanings_pt_json) as string[],
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

function mapSession(row: SessionRow): VocabularySessionView {
  return {
    sessionId: row.session_id,
    level: row.level,
    direction: row.direction,
    showFurigana: Boolean(row.show_furigana),
    selectedCount: Number(row.selected_count),
    turn: Number(row.turn),
    current: mapVocabulary(row),
    progress: mapProgress(row),
  };
}

export async function loadVocabularyCatalog(): Promise<VocabularyCatalogResponse> {
  const database = getDatabase();
  const result = await database.prepare(`
    SELECT jlpt_level, COUNT(*) AS count
    FROM vocabulary_catalog
    GROUP BY jlpt_level
  `).all<{ jlpt_level: string; count: number }>();

  const counts = Object.fromEntries(
    result.results.map((row) => [row.jlpt_level, Number(row.count)]),
  );
  return {
    version: 1,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    counts,
  };
}

async function loadLevelIds(level: string) {
  const result = await getDatabase()
    .prepare('SELECT id FROM vocabulary_catalog WHERE jlpt_level = ? ORDER BY id')
    .bind(level)
    .all<{ id: number }>();
  return result.results.map((row) => Number(row.id));
}

async function loadCandidates(
  learnerId: string,
  direction: VocabularyDirection,
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
        LEFT JOIN learner_vocabulary_progress AS progress
          ON progress.learner_id = ?
         AND progress.direction = ?
         AND progress.vocabulary_id = CAST(selected.value AS INTEGER)
        LEFT JOIN vocabulary_session_cooldowns AS cooldown
          ON cooldown.session_id = ?
         AND cooldown.vocabulary_id = CAST(selected.value AS INTEGER)
        WHERE COALESCE(cooldown.blocked_until_turn, -1) < ?
        ORDER BY CAST(selected.value AS INTEGER)
      `).bind(selectedIdsJson, learnerId, direction, cooldown.sessionId, cooldown.turn)
    : database.prepare(`
        SELECT
          CAST(selected.value AS INTEGER) AS id,
          COALESCE(progress.copies, 3) AS copies,
          progress.last_result,
          COALESCE(progress.streak, 0) AS streak
        FROM json_each(?) AS selected
        LEFT JOIN learner_vocabulary_progress AS progress
          ON progress.learner_id = ?
         AND progress.direction = ?
         AND progress.vocabulary_id = CAST(selected.value AS INTEGER)
        ORDER BY CAST(selected.value AS INTEGER)
      `).bind(selectedIdsJson, learnerId, direction);

  const result = await statement.all<CandidateRow>();
  return result.results.map((row) => ({ id: Number(row.id), ...mapProgress(row) }));
}

export async function getVocabularySession(learnerId: string, sessionId: string) {
  if (!/^[0-9a-f-]{36}$/.test(sessionId)) return null;
  const row = await getDatabase().prepare(`
    SELECT
      session.id AS session_id,
      session.level,
      session.direction,
      session.show_furigana,
      session.selected_ids_json,
      session.selected_count,
      session.turn,
      session.current_vocabulary_id,
      catalog.id,
      catalog.word,
      catalog.reading,
      catalog.meanings_pt_json,
      catalog.jlpt_level,
      COALESCE(progress.copies, 3) AS copies,
      progress.last_result,
      COALESCE(progress.streak, 0) AS streak
    FROM vocabulary_practice_sessions AS session
    JOIN vocabulary_catalog AS catalog ON catalog.id = session.current_vocabulary_id
    LEFT JOIN learner_vocabulary_progress AS progress
      ON progress.learner_id = session.learner_id
     AND progress.vocabulary_id = session.current_vocabulary_id
     AND progress.direction = session.direction
    WHERE session.id = ?
      AND session.learner_id = ?
      AND session.status = 'active'
      AND session.current_vocabulary_id IS NOT NULL
    LIMIT 1
  `).bind(sessionId, learnerId).first<SessionRow>();

  return row ? mapSession(row) : null;
}

export async function startVocabularySession(
  learnerId: string,
  level: string,
  direction: VocabularyDirection,
  showFurigana: boolean,
) {
  const selectedIds = await loadLevelIds(level);
  if (selectedIds.length < 3) {
    throw new KanjiApiError(409, 'selection_too_small', 'Esse nível não possui palavras suficientes para o baralho.');
  }

  const database = getDatabase();
  const sessionId = crypto.randomUUID();
  const selectedIdsJson = JSON.stringify(selectedIds);
  const first = drawWeightedCandidate(
    await loadCandidates(learnerId, direction, selectedIdsJson),
  );

  await database.batch([
    database.prepare(`
      UPDATE vocabulary_practice_sessions
      SET status = 'abandoned', updated_at = CURRENT_TIMESTAMP
      WHERE learner_id = ? AND status = 'active'
    `).bind(learnerId),
    database.prepare(`
      INSERT INTO vocabulary_practice_sessions
        (id, learner_id, level, direction, show_furigana, selected_ids_json, selected_count, turn, current_vocabulary_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 'active')
    `).bind(
      sessionId,
      learnerId,
      level,
      direction,
      showFurigana ? 1 : 0,
      selectedIdsJson,
      selectedIds.length,
      first.id,
    ),
    database.prepare(`
      INSERT INTO vocabulary_session_cooldowns (session_id, vocabulary_id, blocked_until_turn)
      VALUES (?, ?, 3)
    `).bind(sessionId, first.id),
  ]);

  const session = await getVocabularySession(learnerId, sessionId);
  if (!session) throw new KanjiApiError(500, 'session_creation_failed', 'Não foi possível abrir a sessão.');
  return session;
}

export async function answerVocabularySession(
  learnerId: string,
  sessionId: string,
  expectedTurn: number,
  expectedVocabularyId: number,
  result: AnswerResult,
) {
  const database = getDatabase();
  const session = await database.prepare(`
    SELECT
      session.id AS session_id,
      session.level,
      session.direction,
      session.show_furigana,
      session.selected_ids_json,
      session.selected_count,
      session.turn,
      session.current_vocabulary_id,
      catalog.id,
      catalog.word,
      catalog.reading,
      catalog.meanings_pt_json,
      catalog.jlpt_level,
      COALESCE(progress.copies, 3) AS copies,
      progress.last_result,
      COALESCE(progress.streak, 0) AS streak
    FROM vocabulary_practice_sessions AS session
    JOIN vocabulary_catalog AS catalog ON catalog.id = session.current_vocabulary_id
    LEFT JOIN learner_vocabulary_progress AS progress
      ON progress.learner_id = session.learner_id
     AND progress.vocabulary_id = session.current_vocabulary_id
     AND progress.direction = session.direction
    WHERE session.id = ? AND session.learner_id = ? AND session.status = 'active'
    LIMIT 1
  `).bind(sessionId, learnerId).first<SessionRow>();

  if (!session) throw new KanjiApiError(404, 'session_not_found', 'Essa sessão não existe mais.');
  if (Number(session.turn) !== expectedTurn || Number(session.current_vocabulary_id) !== expectedVocabularyId) {
    throw new KanjiApiError(409, 'stale_answer', 'Esta carta já foi respondida. Atualize a sessão.');
  }

  const before = mapProgress(session);
  const after = calculateAnsweredProgress(before, result);
  const nextTurn = expectedTurn + 1;
  const candidates = await loadCandidates(
    learnerId,
    session.direction,
    session.selected_ids_json,
    { sessionId, turn: nextTurn },
  );
  const next = drawWeightedCandidate(candidates);

  await database.batch([
    database.prepare(`
      INSERT INTO vocabulary_practice_answers
        (session_id, learner_id, turn, vocabulary_id, direction, result, copies_before, copies_after, streak_before, streak_after)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      sessionId,
      learnerId,
      expectedTurn,
      expectedVocabularyId,
      session.direction,
      result,
      before.copies,
      after.copies,
      before.streak,
      after.streak,
    ),
    database.prepare(`
      INSERT INTO learner_vocabulary_progress
        (learner_id, vocabulary_id, direction, copies, last_result, streak, correct_count, wrong_count, last_seen_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (learner_id, vocabulary_id, direction) DO UPDATE SET
        copies = excluded.copies,
        last_result = excluded.last_result,
        streak = excluded.streak,
        correct_count = learner_vocabulary_progress.correct_count + excluded.correct_count,
        wrong_count = learner_vocabulary_progress.wrong_count + excluded.wrong_count,
        last_seen_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      learnerId,
      expectedVocabularyId,
      session.direction,
      after.copies,
      after.lastResult,
      after.streak,
      result === 'correct' ? 1 : 0,
      result === 'wrong' ? 1 : 0,
    ),
    database.prepare(`
      UPDATE vocabulary_practice_sessions
      SET turn = ?, current_vocabulary_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND learner_id = ? AND turn = ? AND current_vocabulary_id = ? AND status = 'active'
    `).bind(nextTurn, next.id, sessionId, learnerId, expectedTurn, expectedVocabularyId),
    database.prepare(`
      INSERT INTO vocabulary_session_cooldowns (session_id, vocabulary_id, blocked_until_turn)
      VALUES (?, ?, ?)
      ON CONFLICT (session_id, vocabulary_id) DO UPDATE SET blocked_until_turn = excluded.blocked_until_turn
    `).bind(sessionId, next.id, nextTurn + 2),
  ]);

  const updated = await getVocabularySession(learnerId, sessionId);
  if (!updated) throw new KanjiApiError(500, 'session_update_failed', 'A próxima carta não conseguiu abrir.');
  return updated;
}

export async function closeVocabularySession(learnerId: string, sessionId: string) {
  const result = await getDatabase().prepare(`
    UPDATE vocabulary_practice_sessions
    SET status = 'completed', current_vocabulary_id = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND learner_id = ? AND status = 'active'
  `).bind(sessionId, learnerId).run();
  return Number(result.meta.changes) > 0;
}

