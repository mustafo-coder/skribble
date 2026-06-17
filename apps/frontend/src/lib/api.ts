import type {
  AuthResponse,
  AuthTokens,
  GuestRequest,
  LoginRequest,
  RegisterRequest,
  RoomSummary,
  UserProfile,
} from '@skribble/shared';

const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api`;

/** In-memory access token + a getter for the refresh token (owned by authStore). */
let accessToken: string | null = null;
let refreshHandler: (() => Promise<string | null>) | null = null;

export const tokenBridge = {
  setAccessToken(t: string | null) {
    accessToken = t;
  },
  /** authStore registers how to refresh so the client can retry 401s once. */
  setRefreshHandler(fn: (() => Promise<string | null>) | null) {
    refreshHandler = fn;
  },
};

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (res.status === 401 && retry && refreshHandler) {
    const fresh = await refreshHandler();
    if (fresh) {
      accessToken = fresh;
      return request<T>(path, init, false); // single retry with the new token
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? res.statusText);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  // ── Auth ──
  register: (b: RegisterRequest) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(b) }),
  login: (b: LoginRequest) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(b) }),
  guest: (b: GuestRequest) =>
    request<AuthResponse>('/auth/guest', { method: 'POST', body: JSON.stringify(b) }),
  refresh: (refreshToken: string) =>
    request<AuthTokens>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }, false),
  logout: (refreshToken: string) =>
    request<void>('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }, false),
  me: () => request<UserProfile>('/auth/me'),

  // ── Lobby / profile ──
  listRooms: () => request<RoomSummary[]>('/rooms'),
  profile: (id: string) => request<UserProfile>(`/users/${id}`),
  leaderboard: () => request<UserProfile[]>('/users/leaderboard'),
};

export { ApiError };
