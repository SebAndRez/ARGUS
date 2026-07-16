import { describe, expect, it } from "vitest";
import { extractLessonsFromText } from "@/lib/knowledge-intake/lessonExtractor";

/**
 * ARGUS Prompt 20 — converted from
 * `src/lib/knowledge-intake/__tests__/lessonExtractor.test.ts` (a
 * `runLessonExtractorTest()` export Vitest never ran).
 */
describe("extractLessonsFromText", () => {
  const lessons = extractLessonsFromText(
    "SENAPRED reporta evacuacion, ruta afectada y necesidad de validacion cruzada en Chile.",
    "wildfire"
  );

  it("extracts exactly one lesson from the text", () => {
    expect(lessons.length).toBe(1);
  });

  it("flags the lesson as applicable to Chile (text mentions SENAPRED/Chile)", () => {
    expect(lessons[0].applicableToChile).toBe(true);
  });
});
