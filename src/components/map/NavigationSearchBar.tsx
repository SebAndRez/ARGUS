"use client";

import { useEffect, useRef, useState } from "react";
import { searchPlaces, type PlaceResult } from "@/lib/geocoding/geocodingService";
import type { GeoPoint } from "@/lib/routing/routingService";

/**
 * Buscador de destino tipo Google Maps/Waze para el mapa operacional de
 * ARGUS: direccion, hospital, refugio, punto de interes o coordenada.
 */

interface Props {
  userLocation: GeoPoint;
  onSelect: (place: PlaceResult) => void;
  onClear?: () => void;
  selectedLabel?: string | null;
}

const typeIcon: Record<PlaceResult["type"], string> = {
  address: "📍",
  hospital: "🏥",
  clinic: "🏥",
  landmark: "⭐",
  shelter: "🏠",
  custom: "🧭",
};

export default function NavigationSearchBar({ userLocation, onSelect, onClear, selectedLabel = null }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const requestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      const places = await searchPlaces(query, userLocation);
      if (requestIdRef.current === requestId) {
        setResults(places);
        setIsLoading(false);
        setIsOpen(true);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const selectPlace = (place: PlaceResult) => {
    setQuery(place.label);
    setIsOpen(false);
    setResults([]);
    onSelect(place);
  };

  const clearSearch = () => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    onClear?.();
  };

  return (
    <div className="argus-nav-search-bar pointer-events-auto relative w-full max-w-sm">
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/92 px-3 py-2 shadow-xl shadow-black/40 backdrop-blur-xl">
        <span aria-hidden className="text-sm">
          🔍
        </span>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={selectedLabel ?? "Buscar direccion, hospital, refugio o coordenada"}
          className="min-w-0 flex-1 bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={clearSearch}
            className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[0.6rem] font-bold uppercase text-slate-300"
          >
            X
          </button>
        )}
      </div>

      {isOpen && (isLoading || results.length > 0) && (
        <ul className="argus-nav-search-results absolute left-0 right-0 top-[calc(100%+0.4rem)] max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-slate-950/96 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
          {isLoading && <li className="px-3 py-2 text-[0.65rem] text-slate-500">Buscando...</li>}
          {!isLoading &&
            results.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => selectPlace(place)}
                  className="flex w-full items-start gap-2 rounded px-2.5 py-2 text-left text-xs text-slate-200 hover:bg-white/[0.06]"
                >
                  <span aria-hidden className="mt-0.5 text-sm">
                    {typeIcon[place.type]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-white">{place.label}</span>
                    {place.address && <span className="block truncate text-[0.62rem] text-slate-400">{place.address}</span>}
                  </span>
                  {place.distanceKm !== undefined && (
                    <span className="shrink-0 text-[0.58rem] font-bold uppercase text-cyan-300">
                      {place.distanceKm.toFixed(1)} km
                    </span>
                  )}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
