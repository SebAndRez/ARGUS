import { describe, expect, it } from "vitest";
import { uuidFromSeed } from "../../src/lib/database-target/repositories/deterministicId";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("uuidFromSeed", () => {
  it("produces a syntactically valid UUID", () => {
    expect(uuidFromSeed("ExternalEvent:src_1:ext_1:v1")).toMatch(UUID_RE);
  });

  it("is deterministic — the same seed always yields the same id", () => {
    const a = uuidFromSeed("Report:report_1");
    const b = uuidFromSeed("Report:report_1");
    expect(a).toBe(b);
  });

  it("different seeds yield different ids", () => {
    expect(uuidFromSeed("Report:report_1")).not.toBe(uuidFromSeed("Report:report_2"));
  });
});
