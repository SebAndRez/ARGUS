"use client";

import { Card } from "@/components/sensor-safety/RoadSenseCard";

export default function DeadManSwitchCard({ onDemo }: { onDemo: () => void }) {
  return (
    <Card title="Dead Man Switch" status="Modo emergencia demo">
      <p>Check-in periodico cuando el usuario activa modo emergencia.</p>
      <p className="text-amber-100">La no respuesta genera una alerta preliminar, no confirma peligro.</p>
      <button onClick={onDemo} className="argus-safety-demo-button" type="button">
        Simular no respuesta
      </button>
    </Card>
  );
}
