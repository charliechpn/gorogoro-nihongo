import { KanjiApiError } from './logic';

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw new KanjiApiError(403, 'cross_origin_forbidden', 'Esta ação precisa partir do próprio site.');
  }
}

export async function readJsonBody(request: Request, maximumBytes = 128_000) {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new KanjiApiError(413, 'payload_too_large', 'A requisição ficou grande demais.');
  }

  try {
    return await request.json() as unknown;
  } catch {
    throw new KanjiApiError(400, 'invalid_json', 'A requisição não contém JSON válido.');
  }
}

export function jsonResponse(payload: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export async function withKanjiApiErrors(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof KanjiApiError) {
      return jsonResponse({ error: error.code, message: error.message }, error.status);
    }

    const message = error instanceof Error ? error.message : '';
    if (message.includes('stale_kanji_answer') || message.includes('UNIQUE constraint failed')) {
      return jsonResponse(
        { error: 'stale_answer', message: 'Esta carta já foi respondida. Atualize a sessão.' },
        409,
      );
    }

    console.error('Kanji API failure', error);
    return jsonResponse(
      { error: 'internal_error', message: 'O backend do treino tropeçou no próprio quimono.' },
      500,
    );
  }
}
