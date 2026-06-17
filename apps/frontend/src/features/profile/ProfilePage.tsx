import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function ProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['profile', id],
    queryFn: () => api.profile(id!),
    enabled: !!id,
  });

  if (isLoading) return <Center>Loading profile…</Center>;
  if (isError || !data) return <Center>Profile not found.</Center>;

  const winRate = data.totalGames ? Math.round((data.totalWins / data.totalGames) * 100) : 0;

  return (
    <div className="mx-auto max-w-md p-4">
      <button onClick={() => navigate(-1)} className="btn-ghost mb-4 h-8 px-3">
        ← Back
      </button>
      <div className="card text-center">
        <div className="mx-auto mb-2 grid h-20 w-20 place-items-center rounded-full bg-slate-700 text-4xl">
          🎨
        </div>
        <h1 className="text-2xl font-bold">{data.username}</h1>
        <p className="text-sm text-slate-400">
          {data.isGuest ? 'Guest player' : `Joined ${new Date(data.createdAt).toLocaleDateString()}`}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat label="Rating" value={data.rating} />
          <Stat label="Games" value={data.totalGames} />
          <Stat label="Wins" value={data.totalWins} />
        </div>
        <p className="mt-3 text-sm text-slate-400">Win rate: {winRate}%</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-700/40 p-3">
      <p className="text-xl font-bold text-brand-300">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid h-screen place-items-center text-slate-300">{children}</div>;
}
