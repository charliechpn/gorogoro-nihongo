import { KanjiApiError } from '../kanji/logic.ts';
import type { AnswerResult } from '@/app/treino/kanji/deck';
import type { VocabularyDirection } from '@/app/treino/vocabulario/contracts';

const JLPT_LEVELS = new Set(['N5', 'N4', 'N3', 'N2', 'N1']);

export function validateVocabularyConfiguration(
  level: unknown,
  direction: unknown,
  showFurigana: unknown,
) {
  if (typeof level !== 'string' || !JLPT_LEVELS.has(level)) {
    throw new KanjiApiError(400, 'invalid_level', 'Escolha um nível JLPT válido.');
  }
  if (direction !== 'pt_to_jp' && direction !== 'jp_to_pt') {
    throw new KanjiApiError(400, 'invalid_direction', 'Escolha uma direção válida para o treino.');
  }
  if (typeof showFurigana !== 'boolean') {
    throw new KanjiApiError(400, 'invalid_furigana', 'A preferência de furigana é inválida.');
  }

  return {
    level,
    direction: direction as VocabularyDirection,
    showFurigana: direction === 'jp_to_pt' ? showFurigana : false,
  };
}

export function validateVocabularyAnswer(
  turn: unknown,
  vocabularyId: unknown,
  result: unknown,
) {
  if (!Number.isInteger(turn) || Number(turn) < 1) {
    throw new KanjiApiError(400, 'invalid_turn', 'O turno da resposta é inválido.');
  }
  if (!Number.isInteger(vocabularyId) || Number(vocabularyId) < 1) {
    throw new KanjiApiError(400, 'invalid_vocabulary', 'A palavra da resposta é inválida.');
  }
  if (result !== 'correct' && result !== 'wrong') {
    throw new KanjiApiError(400, 'invalid_result', 'Marque se você acertou ou errou.');
  }

  return {
    turn: Number(turn),
    vocabularyId: Number(vocabularyId),
    result: result as AnswerResult,
  };
}
