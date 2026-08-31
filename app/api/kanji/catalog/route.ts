import { jsonResponse, withKanjiApiErrors } from '../http';
import { loadKanjiCatalog } from '../storage';

export async function GET() {
  return withKanjiApiErrors(async () => jsonResponse(
    await loadKanjiCatalog(),
    200,
    { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  ));
}
