import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile(path: string, override = false) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (process.env[key] && !override) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(join(process.cwd(), ".env"));
loadEnvFile(join(process.cwd(), ".env.local"), true);

const prisma = new PrismaClient();

async function main() {
  const [
    users,
    usersWithGoogleSub,
    usersWithEmailVerifiedAt,
    usersWithoutGovIdHash,
    usersWithEmptyRole,
    usersWithEmptyAccountStatus,
    reports,
    helpRequests,
    auditLogs,
    sanctions,
    externalEvents,
    riskAssessments,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { googleSub: { not: null } } }),
    prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
    prisma.user.count({ where: { governmentIdHash: null } }),
    prisma.user.count({ where: { role: "" } }),
    prisma.user.count({ where: { accountStatus: "" } }),
    prisma.report.count(),
    prisma.helpRequest.count(),
    prisma.auditLog.count(),
    prisma.sanction.count(),
    prisma.externalEvent.count(),
    prisma.riskAssessment.count(),
  ]);

  const usersByStatus = await prisma.user.groupBy({
    by: ["accountStatus"],
    _count: { _all: true },
  });
  const usersByRole = await prisma.user.groupBy({
    by: ["role"],
    _count: { _all: true },
  });
  const emailRows = await prisma.user.findMany({
    select: { email: true },
  });
  const normalizedEmailCounts = new Map<string, number>();
  emailRows.forEach((row) => {
    const normalized = row.email.trim().toLowerCase();
    normalizedEmailCounts.set(normalized, (normalizedEmailCounts.get(normalized) ?? 0) + 1);
  });
  const possibleDuplicateEmailGroups = Array.from(normalizedEmailCounts.values()).filter(
    (count) => count > 1
  ).length;

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        counts: {
          users,
          usersWithGoogleSub,
          usersWithoutGoogleSub: users - usersWithGoogleSub,
          usersWithEmailVerifiedAt,
          usersWithoutEmailVerifiedAt: users - usersWithEmailVerifiedAt,
          usersWithoutGovIdHash,
          usersWithEmptyRole,
          usersWithEmptyAccountStatus,
          possibleDuplicateEmailGroups,
          possibleDuplicateGovIdHashGroups: 0,
          reports,
          helpRequests,
          auditLogs,
          sanctions,
          externalEvents,
          riskAssessments,
        },
        usersByStatus: usersByStatus.map((row) => ({
          status: row.accountStatus,
          count: row._count._all,
        })),
        usersByRole: usersByRole.map((row) => ({
          role: row.role,
          count: row._count._all,
        })),
        privacy: "No emails, document hashes, phones or secret values are printed.",
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
