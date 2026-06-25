"use client";

import type { ReactNode } from "react";

interface Props {
  isGlobeMode: boolean;
  map: ReactNode;
  globe: ReactNode;
}

export default function MapToGlobeTransition({
  isGlobeMode,
  map,
  globe,
}: Props) {
  return (
    <>
      <div
        className={`absolute inset-0 transition-opacity duration-700 ease-out ${
          isGlobeMode ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        aria-hidden={isGlobeMode}
      >
        {map}
      </div>
      <div
        className={`absolute inset-0 transition-opacity duration-700 ease-out ${
          isGlobeMode
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!isGlobeMode}
      >
        {globe}
      </div>
    </>
  );
}
