import { getCurrentUser } from "@/services/authService";
import { hasAnyRole } from "@/lib/security/rbac";
import OperationsPanel from "@/app/admin/operations/OperationsPanel";

export const dynamic = "force-dynamic";

const OPERATOR_ROLES = ["OPERATOR", "ANALYST", "ADMIN", "SUPER_ADMIN"] as const;

/**
 * ARGUS Prompt 19 §28-29 — Server Component. El guard corre en el servidor
 * ANTES de que se monte cualquier componente cliente: a diferencia del
 * precedente `/admin/source-health` (que es enteramente cliente y depende
 * solo de que la API rechace la solicitud), aquí un usuario no autorizado
 * nunca llega a renderizar `OperationsPanel` ni a disparar su primer fetch.
 */
export default async function OperationsHealthPage() {
  const user = await getCurrentUser();
  const authorized = hasAnyRole(user, [...OPERATOR_ROLES]);

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <section className="max-w-lg border border-white/10 bg-slate-900 p-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Acceso no disponible</p>
          <h1 className="mt-2 text-xl font-bold">ARGUS Operations</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Este panel requiere una sesión de operador, analista o administrador.
          </p>
        </section>
      </main>
    );
  }

  return <OperationsPanel />;
}
