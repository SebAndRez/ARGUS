import { loadEnvConfig } from "@next/env";

const DATABASE_URL_ERROR =
  "DATABASE_URL local no está cargada o no es PostgreSQL. Revisa .env.local.";

function loadAndValidateLocalEnv() {
  loadEnvConfig(process.cwd());
  const databaseUrl = process.env.DATABASE_URL;
  if (
    !databaseUrl ||
    (!databaseUrl.startsWith("postgresql://") &&
      !databaseUrl.startsWith("postgres://"))
  ) {
    console.error(DATABASE_URL_ERROR);
    process.exit(1);
  }
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"*".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

async function main() {
  loadAndValidateLocalEnv();
  const { prisma } = await import("../src/lib/prisma");

  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        email: true,
        role: true,
        accountStatus: true,
        createdAt: true,
      },
    });

    console.log(`Users: ${users.length}`);
    for (const user of users) {
      console.log(
        `${maskEmail(user.email)} | role=${user.role} | status=${user.accountStatus} | created=${user.createdAt.toISOString()}`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Unknown error.");
    process.exit(1);
  });
