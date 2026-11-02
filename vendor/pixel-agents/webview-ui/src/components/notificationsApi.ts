import { serverToken } from '../transport/serverToken.js';

export async function notificationRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/notifications/${path}`, {
    redirect: 'error',
    cache: 'no-store',
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${serverToken ?? ''}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Не удалось выполнить действие.');
  return result as T;
}
