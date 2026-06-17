import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_ROOM_SETTINGS, Language, LIMITS, type RoomSettings } from '@skribble/shared';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useGameConnection } from '@/features/game/useGameConnection';

export function LobbyPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { createRoom, joinRoom } = useGameConnection();
  const [settings, setSettings] = useState<RoomSettings>({
    ...DEFAULT_ROOM_SETTINGS,
    name: `${user?.username ?? 'Player'}'s room`,
  });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const rooms = useQuery({ queryKey: ['rooms'], queryFn: api.listRooms, refetchInterval: 5000 });

  const patch = (p: Partial<RoomSettings>) => setSettings((s) => ({ ...s, ...p }));

  const onCreate = async () => {
    setBusy(true);
    await createRoom(settings);
    setBusy(false);
  };

  const onJoin = async (joinCode: string) => {
    if (!joinCode.trim()) return;
    setBusy(true);
    const res = await joinRoom(joinCode.trim().toUpperCase());
    setBusy(false);
    if (res.ok) navigate(`/room/${res.data.room.code}`);
    else alert(res.error.message);
  };

  return (
    <div className="mx-auto max-w-5xl p-4">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-brand-300">Skribble Lobby</h1>
        <div className="flex items-center gap-3 text-sm">
          <button onClick={() => navigate(`/profile/${user?.id}`)} className="hover:underline">
            {user?.username} {user?.isGuest && <span className="text-slate-400">(guest)</span>}
          </button>
          <button onClick={() => logout().then(() => navigate('/login'))} className="btn-ghost h-8 px-3">
            Logout
          </button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Create room */}
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">Create a room</h2>
          <label className="block text-sm">
            Room name
            <input className="input mt-1" value={settings.name} onChange={(e) => patch({ name: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Max players"
              value={settings.maxPlayers}
              min={LIMITS.minPlayers}
              max={LIMITS.maxPlayers}
              onChange={(maxPlayers) => patch({ maxPlayers })}
            />
            <NumberField
              label="Rounds"
              value={settings.rounds}
              min={LIMITS.minRounds}
              max={LIMITS.maxRounds}
              onChange={(rounds) => patch({ rounds })}
            />
            <NumberField
              label="Draw time (s)"
              value={settings.drawTimeSec}
              min={LIMITS.minDrawTime}
              max={LIMITS.maxDrawTime}
              step={10}
              onChange={(drawTimeSec) => patch({ drawTimeSec })}
            />
            <label className="block text-sm">
              Language
              <select
                className="input mt-1"
                value={settings.language}
                onChange={(e) => patch({ language: e.target.value as Language })}
              >
                {Object.values(Language).map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.isPrivate}
              onChange={(e) => patch({ isPrivate: e.target.checked })}
            />
            Private (invite-only)
          </label>
          <button className="btn-primary w-full" onClick={onCreate} disabled={busy}>
            Create room
          </button>
        </section>

        {/* Join */}
        <section className="card space-y-4">
          <div>
            <h2 className="mb-2 text-lg font-bold">Join with a code</h2>
            <div className="flex gap-2">
              <input
                className="input uppercase"
                placeholder="ABC123"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button className="btn-primary px-4" onClick={() => onJoin(code)} disabled={busy}>
                Join
              </button>
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-bold">Public rooms</h2>
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {rooms.data?.length ? (
                rooms.data.map((r) => (
                  <li key={r.id} className="flex items-center justify-between rounded-lg bg-slate-700/40 px-3 py-2">
                    <div>
                      <p className="font-semibold">{r.name}</p>
                      <p className="text-xs text-slate-400">
                        {r.playerCount}/{r.maxPlayers} · {r.language.toUpperCase()}{' '}
                        {r.inProgress && '· in progress'}
                      </p>
                    </div>
                    <button
                      className="btn-ghost h-8 px-3"
                      disabled={busy || r.playerCount >= r.maxPlayers}
                      onClick={() => onJoin(r.code)}
                    >
                      Join
                    </button>
                  </li>
                ))
              ) : (
                <p className="text-sm text-slate-400">No public rooms yet — create one!</p>
              )}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        type="number"
        className="input mt-1"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
