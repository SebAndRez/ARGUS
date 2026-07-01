"use client";

import { Card } from "@/components/sensor-safety/RoadSenseCard";

export default function RouteGuardianCard({ onDemo }: { onDemo: () => void }) {
  return (
    <Card title="Route Guardian" status="Opcional / Futuro nativo">
      <p>Ruta segura opcional con destino demo, ETA y chequeo por detencion anormal o desvio.</p>
      <p className="text-cyan-100">Route Guardian no es tracking permanente. Solo funciona si el usuario activa una ruta segura.</p>
      <button onClick={onDemo} className="argus-safety-demo-button" type="button">
        Simular detencion anormal
      </button>
    </Card>
  );
}
