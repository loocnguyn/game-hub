'use client';
import { SUPABASE_KEY, SUPABASE_URL } from './config';
import { sb } from './supabase';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let offset = 0; // serverNow - Date.now(), smoothed
let offsetSamples = 0;

/** Current time on the server's clock (ms). */
export function serverNow(): number {
  return Date.now() + offset;
}

function learnOffset(serverTime: number, sentAt: number, receivedAt: number) {
  const estimate = serverTime - (sentAt + receivedAt) / 2;
  const rtt = receivedAt - sentAt;
  if (rtt > 3000) return;
  offsetSamples++;
  // Weighted average: quick to converge, resistant to one slow response.
  const w = offsetSamples < 4 ? 1 / offsetSamples : 0.2;
  offset = offset * (1 - w) + estimate * w;
}

/** Call the hub edge function. Throws ApiError with a user-friendly Vietnamese message. */
export async function api<T = any>(op: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data } = await sb().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError('Bạn cần đăng nhập', 401);
  const sentAt = Date.now();
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/hub`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY },
      body: JSON.stringify({ op, ...params }),
    });
  } catch {
    throw new ApiError('Mất kết nối mạng, thử lại nhé', 0);
  }
  const receivedAt = Date.now();
  const body = await res.json().catch(() => ({}));
  if (typeof body?.serverNow === 'number') learnOffset(body.serverNow, sentAt, receivedAt);
  if (!res.ok) throw new ApiError(body?.error || `Lỗi ${res.status}`, res.status);
  return body as T;
}

/** Account creation goes through the shared `register` function (username + password, no email). */
export async function register(username: string, password: string, name: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
    body: JSON.stringify({ username, password, name }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body?.error || 'Không tạo được tài khoản', res.status);
}
