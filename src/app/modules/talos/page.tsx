import { Suspense } from "react";
import TalosDashboard from "@/modules/talos/components/TalosDashboard";

export default function TalosModulePage() {
  return (
    <Suspense fallback={null}>
      <TalosDashboard />
    </Suspense>
  );
}
