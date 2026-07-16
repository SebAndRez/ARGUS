import { Suspense } from "react";
import AtlasDashboard from "@/modules/atlas/components/AtlasDashboard";

export default function AtlasModulePage() {
  return (
    <Suspense fallback={null}>
      <AtlasDashboard />
    </Suspense>
  );
}
