import { redirect } from "next/navigation";

/**
 * ARGUS v1.0.3.4 — `/dashboard/fenix` is now a legacy alias. The canonical
 * FÉNIX entry point is `/modules/fenix` (see
 * docs/modules/ARGUS_FENIX_CANONICALIZATION.md), which already renders the
 * same implementation this page used to (`FenixTwinPanel`), gated by the
 * real session-derived access policy. This is a server-side redirect (no
 * client JS dependency, no intermediate render of any FÉNIX content before
 * the redirect fires) and forwards the original query string unchanged —
 * e.g. the `?lat=&lng=` deep link built by
 * src/lib/notifications/notificationCenterEngine.ts keeps working.
 * `/modules/fenix` never redirects back here, so this cannot loop.
 */
interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardFenixLegacyPage({ searchParams }: Props) {
  const resolvedParams = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedParams)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => query.append(key, entry));
    } else if (value !== undefined) {
      query.append(key, value);
    }
  }
  const suffix = query.toString();
  redirect(suffix ? `/modules/fenix?${suffix}` : "/modules/fenix");
}
