import { Suspense } from "react";
import OraculoDashboard from "@/modules/oraculo/components/OraculoDashboard";

export default function OraculoModulePage() {
  return (
    <Suspense fallback={null}>
      <OraculoDashboard />
    </Suspense>
  );
}
