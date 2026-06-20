export function parseFirmsAcquisitionDateTime(
  acqDate: string,
  acqTime: string
): string | null {
  const dateMatch = acqDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeDigits = acqTime.trim();
  if (!dateMatch || !/^\d{1,4}$/.test(timeDigits)) return null;

  const normalizedTime = timeDigits.padStart(4, "0");
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(normalizedTime.slice(0, 2));
  const minute = Number(normalizedTime.slice(2, 4));

  if (hour > 23 || minute > 59) return null;

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString();
}

function getPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function formatLocalAndUtcTime(isoUtc: string): {
  localDateTimeLabel: string;
  utcTimeLabel: string;
  combinedLabel: string;
} {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) {
    return {
      localDateTimeLabel: "Fecha no disponible",
      utcTimeLabel: "UTC no disponible",
      combinedLabel: "Fecha no disponible",
    };
  }

  const localParts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const utcParts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).formatToParts(date);

  const localDateTimeLabel = `${getPart(localParts, "day")}-${getPart(
    localParts,
    "month"
  )}-${getPart(localParts, "year")}, ${getPart(
    localParts,
    "hour"
  )}:${getPart(localParts, "minute")} ${getPart(
    localParts,
    "dayPeriod"
  ).toUpperCase()}`;
  const utcTimeLabel = `${getPart(utcParts, "hour")}:${getPart(
    utcParts,
    "minute"
  )} UTC`;

  return {
    localDateTimeLabel,
    utcTimeLabel,
    combinedLabel: `${localDateTimeLabel} hora local (${utcTimeLabel})`,
  };
}
