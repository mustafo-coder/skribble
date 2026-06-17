import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, playAsGuest, status, error } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const loading = status === 'loading';

  const onLogin = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/lobby');
    } catch {
      /* error surfaced via store */
    }
  };

  const onGuest = async () => {
    try {
      await playAsGuest();
      navigate('/lobby');
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-900 to-brand-900 p-4">
      <div className="card w-full max-w-sm">
        <h1 className="mb-1 text-center text-3xl font-extrabold text-brand-300">Skribble</h1>
        <p className="mb-6 text-center text-sm text-slate-400">Draw, guess, win.</p>

        <form onSubmit={onLogin} className="space-y-3">
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <button onClick={onGuest} className="btn-ghost mt-3 w-full" disabled={loading}>
          Play as guest
        </button>

        <p className="mt-4 text-center text-sm text-slate-400">
          No account?{' '}
          <Link to="/register" className="text-brand-400 hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
