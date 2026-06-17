import { create } from 'zustand';
import type { AuthResponse, UserProfile } from '@skribble/shared';
import { api, tokenBridge } from '@/lib/api';

const REFRESH_KEY = 'skribble.refresh';

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  status: 'idle' | 'loading' | 'authenticated' | 'error';
  error: string | null;

  register: (email: string, username: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  playAsGuest: (username?: string) => Promise<void>;
  /** Returns a fresh access token (or null) — used by the api client on 401. */
  refresh: () => Promise<string | null>;
  bootstrap: () => Promise<void>;
  logout: () => Promise<void>;
}

function persistRefresh(token: string | null) {
  if (token) localStorage.setItem(REFRESH_KEY, token);
  else localStorage.removeItem(REFRESH_KEY);
}

export const useAuthStore = create<AuthState>((set, get) => {
  function apply(res: AuthResponse) {
    tokenBridge.setAccessToken(res.tokens.accessToken);
    persistRefresh(res.tokens.refreshToken);
    set({
      user: res.user,
      accessToken: res.tokens.accessToken,
      status: 'authenticated',
      error: null,
    });
  }

  // Register the refresh handler so api.ts can transparently retry 401s.
  tokenBridge.setRefreshHandler(() => get().refresh());

  return {
    user: null,
    accessToken: null,
    status: 'idle',
    error: null,

    async register(email, username, password) {
      set({ status: 'loading', error: null });
      try {
        apply(await api.register({ email, username, password }));
      } catch (e) {
        set({ status: 'error', error: (e as Error).message });
        throw e;
      }
    },

    async login(email, password) {
      set({ status: 'loading', error: null });
      try {
        apply(await api.login({ email, password }));
      } catch (e) {
        set({ status: 'error', error: (e as Error).message });
        throw e;
      }
    },

    async playAsGuest(username) {
      set({ status: 'loading', error: null });
      try {
        apply(await api.guest({ username }));
      } catch (e) {
        set({ status: 'error', error: (e as Error).message });
        throw e;
      }
    },

    async refresh() {
      const stored = localStorage.getItem(REFRESH_KEY);
      if (!stored) return null;
      try {
        const tokens = await api.refresh(stored);
        tokenBridge.setAccessToken(tokens.accessToken);
        persistRefresh(tokens.refreshToken); // rotation: store the new one
        set({ accessToken: tokens.accessToken });
        return tokens.accessToken;
      } catch {
        persistRefresh(null);
        set({ user: null, accessToken: null, status: 'idle' });
        return null;
      }
    },

    /** On app load: if a refresh token exists, restore the session. */
    async bootstrap() {
      const token = await get().refresh();
      if (!token) return;
      try {
        const user = await api.me();
        set({ user, status: 'authenticated' });
      } catch {
        set({ status: 'idle' });
      }
    },

    async logout() {
      const stored = localStorage.getItem(REFRESH_KEY);
      if (stored) await api.logout(stored).catch(() => undefined);
      persistRefresh(null);
      tokenBridge.setAccessToken(null);
      set({ user: null, accessToken: null, status: 'idle' });
    },
  };
});
