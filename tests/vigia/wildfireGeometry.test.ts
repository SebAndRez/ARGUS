import { describe, expect, it } from "vitest";
import {
  bboxOverlaps,
  distanceToGeometryBoundaryKm,
  geometryBoundingBox,
  geometryCentroid,
  geometryProximity,
  haversineDistanceKm,
  isFiniteLatLng,
  pointInGeometry,
} from "@/lib/geometry/wildfireGeometry";

const SQUARE_POLYGON = {
  type: "Polygon" as const,
  coordinates: [[[-70.62, -33.42], [-70.58, -33.42], [-70.58, -33.38], [-70.62, -33.38], [-70.62, -33.42]]],
};

describe("wildfireGeometry", () => {
  it("haversineDistanceKm calcula distancia razonable entre dos puntos cercanos", () => {
    const distance = haversineDistanceKm({ lat: -33.4, lng: -70.6 }, { lat: -33.41, lng: -70.61 });
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(2);
  });

  it("geometryCentroid promedia los vértices de un polígono", () => {
    const centroid = geometryCentroid(SQUARE_POLYGON);
    expect(centroid).not.toBeNull();
    expect(centroid!.lat).toBeCloseTo(-33.4, 1);
    expect(centroid!.lng).toBeCloseTo(-70.6, 1);
  });

  it("geometryCentroid retorna null para geometría inválida (Caso 15)", () => {
    expect(geometryCentroid(undefined)).toBeNull();
    expect(geometryCentroid({ type: "Polygon", coordinates: "not-an-array" } as never)).toBeNull();
    expect(geometryCentroid({ type: "Point", coordinates: ["a", "b"] } as never)).toBeNull();
  });

  it("pointInGeometry detecta contención dentro de un polígono", () => {
    expect(pointInGeometry({ lat: -33.4, lng: -70.6 }, SQUARE_POLYGON)).toBe(true);
    expect(pointInGeometry({ lat: -30, lng: -70.6 }, SQUARE_POLYGON)).toBe(false);
  });

  it("pointInGeometry maneja geometría malformada sin lanzar (Caso 15)", () => {
    expect(pointInGeometry({ lat: -33.4, lng: -70.6 }, { type: "Polygon", coordinates: [] } as never)).toBe(false);
    expect(pointInGeometry({ lat: NaN, lng: NaN }, SQUARE_POLYGON)).toBe(false);
  });

  it("distanceToGeometryBoundaryKm devuelve 0 cuando el punto está adentro", () => {
    expect(distanceToGeometryBoundaryKm({ lat: -33.4, lng: -70.6 }, SQUARE_POLYGON)).toBe(0);
  });

  it("distanceToGeometryBoundaryKm devuelve una distancia positiva cuando el punto está afuera", () => {
    const distance = distanceToGeometryBoundaryKm({ lat: -30, lng: -70.6 }, SQUARE_POLYGON);
    expect(distance).not.toBeNull();
    expect(distance!).toBeGreaterThan(0);
  });

  it("geometryProximity prioriza contención de polígono sobre distancia centroide-centroide", () => {
    const point = { type: "Point" as const, coordinates: [-70.6, -33.4] as [number, number] };
    const proximity = geometryProximity(point, SQUARE_POLYGON);
    expect(proximity.contained).toBe(true);
    expect(proximity.distanceKm).toBe(0);
  });

  it("geometryProximity cae a distancia centroide-centroide cuando ninguna geometría es polígono", () => {
    const a = { type: "Point" as const, coordinates: [-70.6, -33.4] as [number, number] };
    const b = { type: "Point" as const, coordinates: [-70.61, -33.41] as [number, number] };
    const proximity = geometryProximity(a, b);
    expect(proximity.contained).toBe(false);
    expect(proximity.distanceKm).toBeGreaterThan(0);
  });

  it("geometryBoundingBox + bboxOverlaps preseleccionan sin decidir la fusión final", () => {
    const bboxA = geometryBoundingBox(SQUARE_POLYGON)!;
    const bboxB = geometryBoundingBox({ type: "Point", coordinates: [-70.6, -33.4] })!;
    expect(bboxOverlaps(bboxA, bboxB)).toBe(true);
    const farBbox = geometryBoundingBox({ type: "Point", coordinates: [10, 10] })!;
    expect(bboxOverlaps(bboxA, farBbox)).toBe(false);
  });

  it("isFiniteLatLng rechaza coordenadas fuera de rango o no numéricas (Caso 14)", () => {
    expect(isFiniteLatLng({ lat: -33.4, lng: -70.6 })).toBe(true);
    expect(isFiniteLatLng({ lat: NaN, lng: -70.6 })).toBe(false);
    expect(isFiniteLatLng({ lat: 200, lng: -70.6 })).toBe(false);
    expect(isFiniteLatLng(undefined)).toBe(false);
  });
});
