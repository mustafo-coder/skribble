import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, status, error } = useAuthStore();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const loading = status === 'loading';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await register(email, username, password);
      navigate('/lobby');
    } catch {
      /* error surfaced via store */
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-900 to-brand-900 p-4">
      <div className="card w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-extrabold text-brand-300">Create account</h1>
        <form onSubmit={onSubmit} className="space-y-3">
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
            placeholder="Username"
            value={username}
            minLength={3}
            maxLength={20}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password (min 8 chars)"
            value={password}
            minLength={8}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Creating…' : 'Register'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-400 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
