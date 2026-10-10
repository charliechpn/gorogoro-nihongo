import type { AnswerResult } from '../kanji/deck';
import type {
  AnswerVocabularySessionInput,
  StartVocabularySessionInput,
  VocabularyCatalogResponse,
  VocabularySessionView,
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
  if (!response.ok) throw new Error(payload?.message || 'O treino de vocabulário não respondeu direito.');
  return payload as T;
}

export function fetchVocabularyCatalog() {
  return requestJson<VocabularyCatalogResponse>('/api/vocabulary/catalog');
}

export async function resumeVocabularySession(sessionId: string) {
  const payload = await requestJson<{ session: VocabularySessionView | null }>(
    `/api/vocabulary/session?sessionId=${encodeURIComponent(sessionId)}`,
  );
  return payload.session;
}

export async function createVocabularySession(input: StartVocabularySessionInput) {
  const payload = await requestJson<{ session: VocabularySessionView }>('/api/vocabulary/session', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.session;
}

export async function submitVocabularyAnswer(input: AnswerVocabularySessionInput) {
  const payload = await requestJson<{ session: VocabularySessionView }>('/api/vocabulary/answer', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return payload.session;
}

export async function closeVocabularySession(sessionId: string) {
  await requestJson<{ closed: boolean }>(
    `/api/vocabulary/session?sessionId=${encodeURIComponent(sessionId)}`,
    { method: 'DELETE', keepalive: true },
  );
}

export type { AnswerResult };

