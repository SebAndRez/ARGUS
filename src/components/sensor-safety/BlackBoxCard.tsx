"use client";

import { Card } from "@/components/sensor-safety/RoadSenseCard";

export default function BlackBoxCard() {
  return (
    <Card title="ARGUS Black Box" status="Local / Futuro">
      <p>Guarda hora, tipo de evento, aceleracion pico, bateria, red y ubicacion aproximada si el usuario autorizo.</p>
      <p className="text-cyan-100">ARGUS Black Box no graba audio ni camara. Solo guarda datos tecnicos minimos del evento critico si el usuario lo autorizo.</p>
    </Card>
  );
}
