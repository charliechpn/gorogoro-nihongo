import { assertSameOrigin, jsonResponse, readJsonBody, withKanjiApiErrors } from '../http';
import { normalizeImportedProgress, resolveLearnerId } from '../logic';
import { importLegacyKanjiProgress } from '../storage';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return withKanjiApiErrors(async () => {
    assertSameOrigin(request);
    const learnerId = resolveLearnerId(request.headers);
    const body = await readJsonBody(request);
    const entries = normalizeImportedProgress((body as { progress?: unknown })?.progress);
    const imported = await importLegacyKanjiProgress(learnerId, entries);
    return jsonResponse({ imported });
  });
}
