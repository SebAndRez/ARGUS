"use client";

import { Card } from "@/components/sensor-safety/RoadSenseCard";

export default function FallSenseCard({ onDemo }: { onDemo: () => void }) {
  return (
    <Card title="FallSense" status="Preparado / Demo">
      <p>Detecta caida fuerte, impacto y posible falta de movimiento posterior.</p>
      <p className="text-amber-100">Una caida detectada no confirma lesion. ARGUS pedira respuesta antes de escalar.</p>
      <button onClick={onDemo} className="argus-safety-demo-button" type="button">
        Simular caida fuerte
      </button>
    </Card>
  );
}
