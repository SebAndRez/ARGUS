import { VESTA_REMINDER_TEMPLATES } from "@/modules/vesta/data";

/**
 * Recordatorios por defecto sembrados en el primer PreparednessProfile de un
 * usuario, con su primer vencimiento a partir de hoy.
 */
export function buildDefaultVestaReminders(now: Date = new Date()) {
  return VESTA_REMINDER_TEMPLATES.map((template) => {
    const dueAt = new Date(now);
    dueAt.setDate(dueAt.getDate() + template.frequencyDays);
    return {
      type: template.type,
      title: template.title,
      dueAt,
      frequencyDays: template.frequencyDays,
      status: "pending" as const,
    };
  });
}

export function nextReminderDueDate(frequencyDays: number | null, from: Date = new Date()) {
  const dueAt = new Date(from);
  dueAt.setDate(dueAt.getDate() + (frequencyDays ?? 90));
  return dueAt;
}
