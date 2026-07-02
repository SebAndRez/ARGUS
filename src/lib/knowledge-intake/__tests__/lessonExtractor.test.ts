import { extractLessonsFromText } from "@/lib/knowledge-intake/lessonExtractor";

export function runLessonExtractorTest() {
  const lessons = extractLessonsFromText("SENAPRED reporta evacuacion, ruta afectada y necesidad de validacion cruzada en Chile.", "wildfire");
  return {
    passed: lessons.length === 1 && lessons[0].applicableToChile,
    lessons,
  };
}
