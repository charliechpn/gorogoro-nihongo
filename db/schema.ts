import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const kanjiCatalog = sqliteTable(
  'kanji_catalog',
  {
    id: integer('id').primaryKey(),
    character: text('character').notNull(),
    meaningPt: text('meaning_pt').notNull(),
    onyomi: text('onyomi'),
    kunyomi: text('kunyomi'),
    grade: integer('grade').notNull(),
    jlptLevel: text('jlpt_level'),
    fullWordsJson: text('full_words_json').notNull().default('[]'),
  },
  (table) => [
    uniqueIndex('idx_kanji_catalog_character').on(table.character),
    index('idx_kanji_catalog_jlpt').on(table.jlptLevel, table.id),
    index('idx_kanji_catalog_grade').on(table.grade, table.id),
    check('chk_kanji_catalog_grade', sql`${table.grade} BETWEEN 1 AND 6`),
  ],
);

export const learnerKanjiProgress = sqliteTable(
  'learner_kanji_progress',
  {
    learnerId: text('learner_id').notNull(),
    kanjiId: integer('kanji_id')
      .notNull()
      .references(() => kanjiCatalog.id, { onDelete: 'cascade' }),
    copies: integer('copies').notNull().default(3),
    lastResult: text('last_result'),
    streak: integer('streak').notNull().default(0),
    correctCount: integer('correct_count').notNull().default(0),
    wrongCount: integer('wrong_count').notNull().default(0),
    firstSeenAt: text('first_seen_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text('last_seen_at'),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.learnerId, table.kanjiId] }),
    index('idx_learner_kanji_progress_learner').on(table.learnerId, table.updatedAt),
    check('chk_learner_kanji_progress_copies', sql`${table.copies} BETWEEN 1 AND 8`),
    check('chk_learner_kanji_progress_streak', sql`${table.streak} BETWEEN 0 AND 1`),
    check(
      'chk_learner_kanji_progress_result',
      sql`${table.lastResult} IS NULL OR ${table.lastResult} IN ('correct', 'wrong')`,
    ),
  ],
);

export const kanjiPracticeSessions = sqliteTable(
  'kanji_practice_sessions',
  {
    id: text('id').primaryKey(),
    learnerId: text('learner_id').notNull(),
    grouping: text('grouping').notNull(),
    level: text('level').notNull(),
    selectedIdsJson: text('selected_ids_json').notNull(),
    selectedCount: integer('selected_count').notNull(),
    turn: integer('turn').notNull().default(0),
    currentKanjiId: integer('current_kanji_id').references(() => kanjiCatalog.id),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_kanji_sessions_learner_status').on(table.learnerId, table.status, table.updatedAt),
    check('chk_kanji_sessions_grouping', sql`${table.grouping} IN ('jlpt', 'grade')`),
    check('chk_kanji_sessions_status', sql`${table.status} IN ('active', 'completed', 'abandoned')`),
    check('chk_kanji_sessions_selected_count', sql`${table.selectedCount} >= 3`),
  ],
);

export const kanjiSessionCooldowns = sqliteTable(
  'kanji_session_cooldowns',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => kanjiPracticeSessions.id, { onDelete: 'cascade' }),
    kanjiId: integer('kanji_id')
      .notNull()
      .references(() => kanjiCatalog.id, { onDelete: 'cascade' }),
    blockedUntilTurn: integer('blocked_until_turn').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.kanjiId] }),
    index('idx_kanji_cooldowns_session_turn').on(table.sessionId, table.blockedUntilTurn),
  ],
);

export const kanjiPracticeAnswers = sqliteTable(
  'kanji_practice_answers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: text('session_id')
      .notNull()
      .references(() => kanjiPracticeSessions.id, { onDelete: 'cascade' }),
    learnerId: text('learner_id').notNull(),
    turn: integer('turn').notNull(),
    kanjiId: integer('kanji_id')
      .notNull()
      .references(() => kanjiCatalog.id, { onDelete: 'cascade' }),
    result: text('result').notNull(),
    copiesBefore: integer('copies_before').notNull(),
    copiesAfter: integer('copies_after').notNull(),
    streakBefore: integer('streak_before').notNull(),
    streakAfter: integer('streak_after').notNull(),
    answeredAt: text('answered_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('idx_kanji_answers_session_turn').on(table.sessionId, table.turn),
    index('idx_kanji_answers_learner_date').on(table.learnerId, table.answeredAt),
    check('chk_kanji_answers_result', sql`${table.result} IN ('correct', 'wrong')`),
  ],
);
