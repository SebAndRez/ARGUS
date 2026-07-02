import { prisma } from "../src/lib/prisma";

const ALLOWED_ROLES = new Set([
  "OPERATOR",
  "ANALYST",
  "ADMIN",
  "SUPER_ADMIN",
  "INSTITUTIONAL_ADMIN",
]);

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

async function main() {
  const email = readArg("--email")?.trim().toLowerCase();
  const role = readArg("--role")?.trim().toUpperCase();

  if (!email || !role || !hasFlag("--confirm")) {
    console.error(
      "Usage: tsx scripts/promoteOwnerRole.ts --email user@example.com --role ADMIN --confirm"
    );
    process.exit(1);
  }

  if (!ALLOWED_ROLES.has(role)) {
    console.error(`Role not allowed. Use one of: ${Array.from(ALLOWED_ROLES).join(", ")}`);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true },
  });

  if (!user) {
    console.error(`User not found: ${maskEmail(email)}`);
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role },
    select: { email: true, role: true },
  });

  console.log("Role promotion complete.");
  console.log(`User: ${maskEmail(updated.email)}`);
  console.log(`Old role: ${user.role}`);
  console.log(`New role: ${updated.role}`);
  console.log("Ask the user to sign out and sign in again if the current session still shows the previous role.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Unknown error.");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
