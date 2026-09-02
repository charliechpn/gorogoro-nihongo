import { jsonResponse, withKanjiApiErrors } from '../../kanji/http';
import { loadVocabularyCatalog } from '../storage';

export async function GET() {
  return withKanjiApiErrors(async () => jsonResponse(
    await loadVocabularyCatalog(),
    200,
    { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  ));
}

