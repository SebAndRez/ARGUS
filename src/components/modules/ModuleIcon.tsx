interface Props {
  icon: string;
  className?: string;
}

/**
 * Set mínimo de glifos monocromos (stroke-based) para las tarjetas y páginas
 * de módulos. Deliberadamente sobrio: sin ilustraciones, solo geometría
 * simple consistente con el resto de la UI táctica de ARGUS.
 */
export default function ModuleIcon({ icon, className = "h-5 w-5" }: Props) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (icon) {
    case "heart-pulse":
      return (
        <svg {...common}>
          <path d="M12 20s-7-4.35-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 5c-2.5 4.65-9.5 9-9.5 9Z" />
          <path d="M4 12h3l1.5-3 2 5 1.5-3H20" />
        </svg>
      );
    case "twin":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="4" />
          <circle cx="16" cy="16" r="4" strokeDasharray="2 2" />
          <path d="M11 11l2 2" />
        </svg>
      );
    case "command":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="12" rx="1.5" />
          <path d="M8 20h8M12 16v4" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
          <path d="M9.5 12l1.8 1.8L14.5 10" />
        </svg>
      );
    case "route":
      return (
        <svg {...common}>
          <circle cx="6" cy="18" r="2" />
          <circle cx="18" cy="6" r="2" />
          <path d="M6 16c0-6 12-2 12-8" />
        </svg>
      );
    case "shelter":
      return (
        <svg {...common}>
          <path d="M4 11L12 4l8 7" />
          <path d="M6 10v9h12v-9" />
          <path d="M10 19v-5h4v5" />
        </svg>
      );
    case "logistics":
      return (
        <svg {...common}>
          <rect x="3" y="8" width="12" height="8" rx="1" />
          <path d="M15 11h3l3 3v2h-6" />
          <circle cx="7" cy="18" r="1.6" />
          <circle cx="17" cy="18" r="1.6" />
        </svg>
      );
    case "osint":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-4.3-4.3" />
          <path d="M8 11h6M11 8v6" />
        </svg>
      );
    case "report":
      return (
        <svg {...common}>
          <path d="M6 3v18" />
          <path d="M6 4h11l-2.5 3.5L17 11H6" />
        </svg>
      );
    case "gauge":
      return (
        <svg {...common}>
          <path d="M4 15a8 8 0 1 1 16 0" />
          <path d="M12 15l4-5" />
          <path d="M12 15h.01" />
        </svg>
      );
    case "backpack":
      return (
        <svg {...common}>
          <path d="M9 4h6a1 1 0 0 1 1 1v1.2c1.8.6 3 2.3 3 4.3v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-8c0-2 1.2-3.7 3-4.3V5a1 1 0 0 1 1-1Z" />
          <path d="M9 4v3h6V4" />
          <path d="M9 12h6M10 16h4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}
