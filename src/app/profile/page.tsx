import UserTrustProfileCard from "@/components/trust/UserTrustProfileCard";
import { buildTrustProfileForUser } from "@/lib/trust/trustProfileService";
import { getCurrentUser } from "@/services/authService";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  const profile = await buildTrustProfileForUser(user?.id ?? null);

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white sm:p-6">
      <div className="mx-auto max-w-6xl">
        {!user && (
          <div className="mb-4 rounded border border-amber-300/20 bg-amber-400/10 p-3 text-sm text-amber-100">
            Mostrando perfil DEMO. Inicia sesion para ver tu perfil real.
          </div>
        )}
        <UserTrustProfileCard profile={profile} />
      </div>
    </main>
  );
}
