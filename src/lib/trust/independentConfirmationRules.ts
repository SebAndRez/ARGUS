export type ConfirmationSignal = {
  userId: string;
  accountAgeDays: number;
  verifiedIdentity: boolean;
  trustScore: number;
  distanceMeters?: number;
  createdAt: string;
};

export function scoreIndependentConfirmation(signal: ConfirmationSignal) {
  let score = 1;
  if (signal.verifiedIdentity) score += 1.25;
  if (signal.accountAgeDays >= 30) score += 0.75;
  if (signal.trustScore >= 75) score += 1;
  if (
    typeof signal.distanceMeters === "number" &&
    signal.distanceMeters >= 30 &&
    signal.distanceMeters <= 3000
  ) {
    score += 0.75;
  }
  return Math.min(5, score);
}

export function hasEnoughIndependentConfirmations(signals: ConfirmationSignal[]) {
  const uniqueUsers = new Set(signals.map((signal) => signal.userId));
  const score = signals.reduce(
    (sum, signal) => sum + scoreIndependentConfirmation(signal),
    0
  );
  return uniqueUsers.size >= 3 && score >= 10;
}

export function isSuspiciousConfirmationBurst(signals: ConfirmationSignal[]) {
  if (signals.length < 3) return false;
  const timestamps = signals
    .map((signal) => new Date(signal.createdAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (timestamps.length < 3) return false;
  return timestamps[timestamps.length - 1] - timestamps[0] < 30_000;
}
