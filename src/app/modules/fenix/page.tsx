import FenixOfficialGate from "@/modules/fenix/components/FenixOfficialGate";

/**
 * ARGUS v1.0.3.4 — canonical FÉNIX entry point. See
 * docs/modules/ARGUS_FENIX_CANONICALIZATION.md: this used to render the
 * largely-simulated `FenixDashboard`; it now renders the more mature
 * `FenixTwinPanel` (via `FenixOfficialGate`, which enforces the real
 * session-derived access policy).
 */
export default function FenixModulePage() {
  return <FenixOfficialGate />;
}
