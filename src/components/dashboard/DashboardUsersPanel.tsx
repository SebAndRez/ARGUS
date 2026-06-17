"use client";

interface UserItem {
  id: string;
  publicAlias: string;
  role: string;
  accountStatus: string;
  trustScore: number;
  strikes: number;
}

interface Props {
  users: UserItem[];
}

export default function DashboardUsersPanel({ users }: Props) {
  return (
    <section className="rounded-[32px] border border-white/10 bg-slate-950/85 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/75">Usuarios</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Estado de cuentas</h2>
        </div>
        <span className="rounded-2xl bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-300">{users.length} cuentas</span>
      </div>
      <div className="grid gap-3">
        {users.slice(0, 6).map((user) => (
          <div key={user.id} className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-white">{user.publicAlias}</p>
                <p className="text-xs text-slate-400">{user.role}</p>
              </div>
              <span className="rounded-full bg-white/5 px-3 py-1 text-[0.65rem] uppercase tracking-[0.24em] text-slate-300">{user.accountStatus}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-400">
              <div>
                <p>Trust</p>
                <p className="mt-1 text-white">{user.trustScore}</p>
              </div>
              <div>
                <p>Strikes</p>
                <p className="mt-1 text-white">{user.strikes}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
