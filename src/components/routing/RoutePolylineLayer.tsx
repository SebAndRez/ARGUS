import type { ArgusNavRoute } from "@/types/routing";

export default function RoutePolylineLayer({
  route,
}: {
  route: ArgusNavRoute | null;
}) {
  if (!route) return null;

  return (
    <div className="rounded border border-cyan-300/15 bg-cyan-400/8 p-2 text-xs text-cyan-100">
      Ruta activa: {route.name} - {route.coordinates.length} puntos demo.
    </div>
  );
}
