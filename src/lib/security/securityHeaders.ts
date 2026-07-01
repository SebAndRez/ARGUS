export function buildDefaultSecurityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(self), accelerometer=(self), gyroscope=(self)",
  };
}

export function buildNoIndexHeaders() {
  return {
    ...buildDefaultSecurityHeaders(),
    "X-Robots-Tag": "noindex, nofollow",
    "Cache-Control": "no-store",
  };
}

export function buildApiProtectionHeaders() {
  return {
    ...buildNoIndexHeaders(),
    "Content-Type": "application/json; charset=utf-8",
  };
}
