import { assertSameOrigin, jsonResponse, readJsonBody, withKanjiApiErrors } from '../../kanji/http';
import { KanjiApiError, resolveLearnerId } from '../../kanji/logic';
import { validateVocabularyConfiguration } from '../logic';
import {
  closeVocabularySession,
  getVocabularySession,
  startVocabularySession,
} from '../storage';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withKanjiApiErrors(async () => {
    const learnerId = resolveLearnerId(request.headers);
    const sessionId = new URL(request.url).searchParams.get('sessionId') ?? '';
    return jsonResponse({ session: await getVocabularySession(learnerId, sessionId) });
  });
}

export async function POST(request: Request) {
  return withKanjiApiErrors(async () => {
    assertSameOrigin(request);
    const learnerId = resolveLearnerId(request.headers);
    const body = await readJsonBody(request) as {
      level?: unknown;
      direction?: unknown;
      showFurigana?: unknown;
    };
    const configuration = validateVocabularyConfiguration(
      body.level,
      body.direction,
      body.showFurigana,
    );
    const session = await startVocabularySession(
      learnerId,
      configuration.level,
      configuration.direction,
      configuration.showFurigana,
    );
    return jsonResponse({ session }, 201);
  });
}

export async function DELETE(request: Request) {
  return withKanjiApiErrors(async () => {
    assertSameOrigin(request);
    const learnerId = resolveLearnerId(request.headers);
    const sessionId = new URL(request.url).searchParams.get('sessionId') ?? '';
    if (!sessionId) throw new KanjiApiError(400, 'session_id_required', 'Informe a sessão.');
    return jsonResponse({ closed: await closeVocabularySession(learnerId, sessionId) });
  });
}

