import { NextResponse } from "next/server";
import { demoFenixScenarios } from "@/data/fenixDemo";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";

export const dynamic = "force-dynamic";

/**
 * ARGUS Prompt 9/10 (DATA-1): estos escenarios son 100% fixture y se servian
 * sin ningun guard — a diferencia de `argus/events`/`notifications`, que ya
 * fallan cerrado con `isDemoDataAllowed()`. No existe catalogo real de
 * escenarios FENIX todavia; en produccion sin `ARGUS_ALLOW_DEMO_DATA` se
 * devuelve una lista vacia en vez de datos sinteticos.
 */
export async function GET() {
  if (!isDemoDataAllowed()) {
    return NextResponse.json({ source: "unavailable", count: 0, scenarios: [] });
  }
  return NextResponse.json({
    source: "demo",
    count: demoFenixScenarios.length,
    scenarios: demoFenixScenarios,
  });
}
