import AtlasDashboard from "@/modules/atlas/components/AtlasDashboard";

/**
 * `/dashboard` es el alias histórico del centro de mando. La implementación
 * real ahora vive en ARGUS ATLAS (`/modules/atlas`); esta ruta solo la
 * reutiliza para no romper enlaces/bookmarks existentes.
 */
export default function DashboardPage() {
  return <AtlasDashboard />;
}
