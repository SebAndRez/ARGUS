import { NextResponse } from "next/server";
import {
  getEmailVerificationState,
  requiresProfileCompletion,
} from "@/lib/identity/accountIdentityPolicy";
import { getCurrentUser } from "@/services/authService";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerificationState: getEmailVerificationState(user),
      emailVerified: Boolean(user.emailVerifiedAt),
      governmentIdPresent: Boolean(user.governmentIdHash),
      countryCode: user.countryCode,
      termsAccepted: Boolean(user.termsAcceptedAt),
      privacyAccepted: Boolean(user.privacyAcceptedAt),
      profileCompletedAt: user.profileCompletedAt?.toISOString() ?? null,
      profileCompletionRequired: requiresProfileCompletion(user),
      publicAlias: user.publicAlias,
      role: user.role,
      accountStatus: user.accountStatus,
      trustScore: user.trustScore,
      strikes: user.strikes,
    },
  });
}
