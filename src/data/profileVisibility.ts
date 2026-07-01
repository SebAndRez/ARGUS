import type { ProfileVisibility } from "@/types/argusProfile";

export const visibilityLabels: Record<ProfileVisibility, string> = {
  PUBLIC: "Publico",
  PRIVATE: "Solo usted",
  AUTHORIZED_UNITS_ONLY: "Unidades autorizadas",
  EMERGENCY_ONLY: "Solo emergencia",
  ADMIN_ONLY: "Administracion",
  HIDDEN: "Oculto",
};

export const visibilityDescriptions: Record<ProfileVisibility, string> = {
  PUBLIC:
    "Visible para otros usuarios cuando interactua, reporta o aparece en funciones comunitarias.",
  PRIVATE: "Solo visible para usted.",
  AUTHORIZED_UNITS_ONLY:
    "Preparado para unidades verificadas. Hasta que la validacion institucional este activa, ARGUS no debe exponer este dato fuera de su cuenta.",
  EMERGENCY_ONLY:
    "Visible solo durante una emergencia, SOS, Safety Check critico o solicitud de ayuda, cuando exista autorizacion.",
  ADMIN_ONLY:
    "Visible solo para administracion autorizada para soporte, auditoria o seguridad.",
  HIDDEN: "No se muestra.",
};

export const visibilityOptions = Object.keys(
  visibilityLabels
) as ProfileVisibility[];
