import { assertSameOrigin, jsonResponse, readJsonBody, withKanjiApiErrors } from '../http';
import {
  KanjiApiError,
  resolveLearnerId,
  sanitizeSelectedIds,
  validateGroupingAndLevel,
} from '../logic';
import { closeKanjiSession, getKanjiSession, startKanjiSession } from '../storage';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withKanjiApiErrors(async () => {
    const learnerId = resolveLearnerId(request.headers);
    const sessionId = new URL(request.url).searchParams.get('sessionId') ?? '';
    const session = await getKanjiSession(learnerId, sessionId);
    return jsonResponse({ session });
  });
}

export async function POST(request: Request) {
  return withKanjiApiErrors(async () => {
    assertSameOrigin(request);
    const learnerId = resolveLearnerId(request.headers);
    const body = await readJsonBody(request) as {
      grouping?: unknown;
      level?: unknown;
      selectedIds?: unknown;
    };
    const { grouping, level } = validateGroupingAndLevel(body.grouping, body.level);
    const selectedIds = sanitizeSelectedIds(body.selectedIds);
    const session = await startKanjiSession(learnerId, grouping, level, selectedIds);
    return jsonResponse({ session }, 201);
  });
}

export async function DELETE(request: Request) {
  return withKanjiApiErrors(async () => {
    assertSameOrigin(request);
    const learnerId = resolveLearnerId(request.headers);
    const sessionId = new URL(request.url).searchParams.get('sessionId') ?? '';
    if (!sessionId) throw new KanjiApiError(400, 'session_id_required', 'Informe a sessão.');
    return jsonResponse({ closed: await closeKanjiSession(learnerId, sessionId) });
  });
}
