export type FetchErrorClass =
  | "timeout"
  | "rate_limited"
  | "auth"
  | "network"
  | "server"
  | "client"
  | "unknown";

export function calculateBackoffDelay(attempt: number, baseSeconds: number) {
  const safeAttempt = Math.max(0, attempt);
  return Math.min(900, Math.max(0, baseSeconds) * 2 ** safeAttempt);
}

export function shouldRetry(errorClass: FetchErrorClass, attempt: number, maxRetries: number) {
  if (attempt >= maxRetries) return false;
  return ["timeout", "rate_limited", "network", "server", "unknown"].includes(errorClass);
}

export function classifyFetchError(statusOrMessage: number | string | null | undefined): FetchErrorClass {
  if (typeof statusOrMessage === "number") {
    if (statusOrMessage === 408) return "timeout";
    if (statusOrMessage === 401 || statusOrMessage === 403) return "auth";
    if (statusOrMessage === 429) return "rate_limited";
    if (statusOrMessage >= 500) return "server";
    if (statusOrMessage >= 400) return "client";
  }
  const message = String(statusOrMessage ?? "").toLowerCase();
  if (message.includes("timeout") || message.includes("aborted")) return "timeout";
  if (message.includes("rate")) return "rate_limited";
  if (message.includes("fetch") || message.includes("network")) return "network";
  return "unknown";
}

export function buildIngestErrorSummary(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    class: classifyFetchError(message),
    message: message.slice(0, 240),
  };
}
