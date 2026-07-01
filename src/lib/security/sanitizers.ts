type AnyRecord = Record<string, unknown>;

export function maskEmail(email: string | null | undefined) {
  if (!email) return null;
  const [name, domain] = email.split("@");
  if (!name || !domain) return "***";
  return `${name.slice(0, 2)}***@${domain}`;
}

export function maskRut(rut: string | null | undefined) {
  if (!rut) return null;
  const normalized = rut.replace(/\s/g, "");
  if (normalized.length <= 4) return "***";
  return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
}

export function sanitizePublicProfile(profile: AnyRecord | null | undefined) {
  if (!profile) return null;
  return pick(profile, ["id", "publicAlias", "displayName", "avatarUrl", "approximateCity", "role"]);
}

export function sanitizeReportForPublic(report: AnyRecord) {
  const safe = pick(report, [
    "id",
    "category",
    "title",
    "description",
    "latitude",
    "longitude",
    "locationText",
    "severity",
    "status",
    "createdAt",
    "updatedAt",
  ]);
  return safe;
}

export function sanitizeReportForCommand(report: AnyRecord, userRole: string | null | undefined) {
  if (["OPERATOR", "ANALYST", "ADMIN", "SUPER_ADMIN"].includes(userRole ?? "")) {
    return report;
  }
  return sanitizeReportForPublic(report);
}

export function sanitizeMedicalProfile(profile: AnyRecord | null | undefined, accessLevel: "none" | "emergency" | "medical" | "admin") {
  if (!profile || accessLevel === "none") return null;
  if (accessLevel === "admin" || accessLevel === "medical") return profile;
  return pick(profile, ["bloodType", "allergies", "emergencyMedicalNote", "mobilityNeeds"]);
}

export function sanitizeMissingPerson(record: AnyRecord, accessLevel: "public" | "command") {
  if (accessLevel === "command") return record;
  return omit(record, ["phone", "email", "documentId", "medicalNotes", "privateNotes"]);
}

export function sanitizeSafetyCheck(record: AnyRecord, accessLevel: "public" | "self" | "command") {
  if (accessLevel === "self" || accessLevel === "command") return record;
  return omit(record, ["userId", "phone", "email", "medicalNote", "emergencyContact"]);
}

function pick(record: AnyRecord, keys: string[]) {
  return Object.fromEntries(keys.filter((key) => key in record).map((key) => [key, record[key]]));
}

function omit(record: AnyRecord, keys: string[]) {
  const blocked = new Set(keys);
  return Object.fromEntries(Object.entries(record).filter(([key]) => !blocked.has(key)));
}
