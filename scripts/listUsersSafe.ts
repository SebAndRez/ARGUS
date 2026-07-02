import { prisma } from "../src/lib/prisma";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"*".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

async function main() {
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
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Unknown error.");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
