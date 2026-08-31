import type { AnswerResult } from '@/app/treino/kanji/deck';
import { assertSameOrigin, jsonResponse, readJsonBody, withKanjiApiErrors } from '../http';
import { KanjiApiError, resolveLearnerId } from '../logic';
import { answerKanjiSession } from '../storage';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return withKanjiApiErrors(async () => {
    assertSameOrigin(request);
    const learnerId = resolveLearnerId(request.headers);
    const body = await readJsonBody(request) as {
      sessionId?: unknown;
      turn?: unknown;
      kanjiId?: unknown;
      result?: unknown;
    };

    if (typeof body.sessionId !== 'string' || !Number.isInteger(body.turn) || !Number.isInteger(body.kanjiId)) {
      throw new KanjiApiError(400, 'invalid_answer', 'A resposta não corresponde a uma carta válida.');
    }
    if (body.result !== 'correct' && body.result !== 'wrong') {
      throw new KanjiApiError(400, 'invalid_result', 'A resposta precisa ser acerto ou erro.');
    }

    const session = await answerKanjiSession(
      learnerId,
      body.sessionId,
      body.turn as number,
      body.kanjiId as number,
      body.result as AnswerResult,
    );
    return jsonResponse({ session });
  });
}
