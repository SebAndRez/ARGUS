export type RateLimitBucket =
  | "public_api"
  | "authenticated_user"
  | "institutional_api"
  | "report_submission"
  | "sos_exception"
  | "abusive_client";

export interface RateLimitPolicy {
  bucket: RateLimitBucket;
  windowSeconds: number;
  maxRequests: number | "unblocked_emergency";
  action: "allow" | "throttle" | "review" | "suspend";
  notes: string;
}

export const rateLimitPolicies: RateLimitPolicy[] = [
  {
    bucket: "public_api",
    windowSeconds: 60,
    maxRequests: 60,
    action: "throttle",
    notes: "Public read endpoints should be throttled. Real implementation needs edge or Redis storage.",
  },
  {
    bucket: "authenticated_user",
    windowSeconds: 60,
    maxRequests: 180,
    action: "throttle",
    notes: "Authenticated citizens get higher read limits.",
  },
  {
    bucket: "institutional_api",
    windowSeconds: 60,
    maxRequests: 600,
    action: "review",
    notes: "Institutional limits depend on contract and audit tier.",
  },
  {
    bucket: "report_submission",
    windowSeconds: 300,
    maxRequests: 20,
    action: "review",
    notes: "Report spam should trigger review, not automatic emergency blocking.",
  },
  {
    bucket: "sos_exception",
    windowSeconds: 60,
    maxRequests: "unblocked_emergency",
    action: "allow",
    notes: "SOS must never be fully blocked by generic rate limits.",
  },
  {
    bucket: "abusive_client",
    windowSeconds: 60,
    maxRequests: 10,
    action: "suspend",
    notes: "Scraping or credential abuse requires suspension and audit.",
  },
];

export function getRateLimitPolicy(bucket: RateLimitBucket) {
  return rateLimitPolicies.find((policy) => policy.bucket === bucket);
}
