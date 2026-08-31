import type { AnswerResult, PersistedKanjiProgress } from './deck';
import type {
  AnswerKanjiSessionInput,
  KanjiCatalogResponse,
  KanjiSessionView,
  StartKanjiSessionInput,
} from './contracts';

const LEARNER_KEY = 'nihongo-learner-id-v1';

function getLearnerId() {
  const existing = window.localStorage.getItem(LEARNER_KEY);
  if (existing) return existing;
  const created = window.crypto.randomUUID();
  window.localStorage.setItem(LEARNER_KEY, created);
  return created;
}

async function requestJson<T>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'x-nihongo-learner-id': getLearnerId(),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  const payload = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new Error(payload?.message || 'O servidor do treino não respondeu direito.');
  return payload as T;
}

export function fetchKanjiCatalog() {
  return requestJson<KanjiCatalogResponse>('/api/kanji/catalog');
}

export async function resumeKanjiSession(sessionId: string) {
  const payload = await requestJson<{ session: KanjiSessionView | null }>(
    `/api/kanji/session?sessionId=${encodeURIComponent(sessionId)}`,
  );
  return payload.session;
}

export async function createKanjiSession(input: StartKanjiSessionInput) {
  const payload = await requestJson<{ session: KanjiSessionView }>('/api/kanji/session', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.session;
}

export async function submitKanjiAnswer(input: AnswerKanjiSessionInput) {
  const payload = await requestJson<{ session: KanjiSessionView }>('/api/kanji/answer', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.session;
}

export async function closeKanjiSession(sessionId: string) {
  await requestJson<{ closed: boolean }>(
    `/api/kanji/session?sessionId=${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
  );
}

export async function importLegacyProgress(progress: Record<number, PersistedKanjiProgress>) {
  await requestJson<{ imported: number }>('/api/kanji/progress', {
    method: 'POST',
    body: JSON.stringify({ progress }),
  });
}

export type { AnswerResult };
