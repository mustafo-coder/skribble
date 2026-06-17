import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { LobbyPage } from './features/lobby/LobbyPage';
import { RoomPage } from './features/room/RoomPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { ConnectionBanner } from './components/ConnectionBanner';

/** Restores the session on first load, then renders the app shell. */
function AppShell() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void bootstrap().finally(() => setReady(true));
  }, [bootstrap]);

  if (!ready) {
    return (
      <div className="grid h-full place-items-center text-slate-300">Loading…</div>
    );
  }
  return (
    <div className="min-h-full text-slate-100">
      <ConnectionBanner />
      <Outlet />
    </div>
  );
}

/** Gate routes that require an authenticated (or guest) session. */
function RequireAuth() {
  const status = useAuthStore((s) => s.status);
  if (status !== 'authenticated') return <Navigate to="/login" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/profile/:id', element: <ProfilePage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/', element: <Navigate to="/lobby" replace /> },
          { path: '/lobby', element: <LobbyPage /> },
          { path: '/room/:code', element: <RoomPage /> },
          { path: '/game/:code', element: <RoomPage /> },
        ],
      },
      { path: '*', element: <Navigate to="/lobby" replace /> },
    ],
  },
]);
