import { prisma } from "@/lib/prisma";

export async function adjustTrustScore(userId: string, change: number) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { trustScore: { increment: change } },
  });
  return user;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `reason` is part of the public contract (callers already pass it) but isn't persisted yet; no strike-reason column exists in Prisma today. See docs/maintenance/ARGUS_REMAINING_TECHNICAL_DEBT.md.
export async function applyStrike(userId: string, reason: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { strikes: { increment: 1 } },
  });

  let accountStatus = user.accountStatus;
  if (user.strikes + 1 >= 5) accountStatus = "BANNED";
  else if (user.strikes + 1 >= 4) accountStatus = "SUSPENDED";
  else if (user.strikes + 1 >= 3) accountStatus = "LIMITED";
  else if (user.strikes + 1 >= 2) accountStatus = "WATCHED";

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { accountStatus },
  });

  return updated;
}

export async function calculateAccountStatus(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  if (user.strikes >= 5) return "BANNED";
  if (user.strikes >= 4) return "SUSPENDED";
  if (user.strikes >= 3) return "LIMITED";
  if (user.strikes >= 2) return "WATCHED";
  return "ACTIVE";
}
