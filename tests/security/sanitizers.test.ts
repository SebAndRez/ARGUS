import { describe, expect, it } from "vitest";
import { isSafeExternalUrl } from "@/lib/security/sanitizers";

/**
 * ARGUS Prompt 5 §Fase Q — map popups (VisualSourcePopup) render an
 * externally-sourced URL as both an `<a href>` and an `<iframe src>`.
 * React escapes text content but not URL protocols, so a `javascript:`
 * value would still execute; this guard must reject it before either sink.
 */
describe("isSafeExternalUrl", () => {
  it("accepts absolute http(s) URLs", () => {
    expect(isSafeExternalUrl("https://example.com/stream")).toBe(true);
    expect(isSafeExternalUrl("http://example.com/stream")).toBe(true);
  });

  it("rejects javascript: and data: URLs", () => {
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rejects malformed values and empty/missing input", () => {
    expect(isSafeExternalUrl("not a url")).toBe(false);
    expect(isSafeExternalUrl("")).toBe(false);
    expect(isSafeExternalUrl(null)).toBe(false);
    expect(isSafeExternalUrl(undefined)).toBe(false);
  });
});
