import { assertSameOrigin, jsonResponse, readJsonBody, withKanjiApiErrors } from '../../kanji/http';
import { KanjiApiError, resolveLearnerId } from '../../kanji/logic';
import { validateVocabularyAnswer } from '../logic';
import { answerVocabularySession } from '../storage';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return withKanjiApiErrors(async () => {
    assertSameOrigin(request);
    const learnerId = resolveLearnerId(request.headers);
    const body = await readJsonBody(request) as {
      sessionId?: unknown;
      turn?: unknown;
      vocabularyId?: unknown;
      result?: unknown;
    };
    if (typeof body.sessionId !== 'string') {
      throw new KanjiApiError(400, 'invalid_session', 'A sessão da resposta é inválida.');
    }
    const answer = validateVocabularyAnswer(body.turn, body.vocabularyId, body.result);
    const session = await answerVocabularySession(
      learnerId,
      body.sessionId,
      answer.turn,
      answer.vocabularyId,
      answer.result,
    );
    return jsonResponse({ session });
  });
}

