import { Suspense } from "react";
import VigiaDashboard from "@/modules/vigia/components/VigiaDashboard";

export default function VigiaModulePage() {
  return (
    <Suspense fallback={null}>
      <VigiaDashboard />
    </Suspense>
  );
}
