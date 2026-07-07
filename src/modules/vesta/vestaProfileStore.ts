import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { VESTA_DEFAULT_CHECKLIST_ITEMS } from "@/modules/vesta/data";
import { buildDefaultVestaReminders } from "@/modules/vesta/vestaReminders";
import {
  calculateVestaCategoryProgress,
  calculateVestaOverallPercentage,
} from "@/modules/vesta/vestaChecklist";
import type {
  VestaChecklistItem,
  VestaChecklistStatus,
  VestaEmergencyContact,
  VestaFamilyMember,
  VestaFamilyPlan,
  VestaProfileSummary,
  VestaReminder,
  VestaReminderStatus,
  VestaReminderType,
  VestaThreatType,
} from "@/modules/vesta/types";

const PROFILE_INCLUDE = {
  familyPlan: true,
  emergencyContacts: { orderBy: { priority: "asc" as const } },
  checklistItems: { orderBy: { createdAt: "asc" as const } },
  reminders: { orderBy: { dueAt: "asc" as const } },
};

type ProfileWithRelations = Prisma.PreparednessProfileGetPayload<{ include: typeof PROFILE_INCLUDE }>;

async function seedDefaultsForNewProfile(profileId: string) {
  const checklistData = Object.entries(VESTA_DEFAULT_CHECKLIST_ITEMS).flatMap(([category, labels]) =>
    labels.map((label) => ({
      profileId,
      category,
      label,
      status: "pending" as const,
      isCustom: false,
    }))
  );
  const reminderData = buildDefaultVestaReminders().map((reminder) => ({
    profileId,
    type: reminder.type,
    title: reminder.title,
    dueAt: reminder.dueAt,
    frequencyDays: reminder.frequencyDays,
    status: reminder.status,
  }));

  await prisma.$transaction([
    prisma.preparednessChecklistItem.createMany({ data: checklistData }),
    prisma.preparednessReminder.createMany({ data: reminderData }),
    prisma.familyPlan.create({ data: { profileId } }),
  ]);
}

export async function getOrCreateVestaProfile(userId: string) {
  let profile = await prisma.preparednessProfile.findUnique({
    where: { userId },
    include: PROFILE_INCLUDE,
  });

  if (!profile) {
    const created = await prisma.preparednessProfile.create({ data: { userId } });
    await seedDefaultsForNewProfile(created.id);
    profile = await prisma.preparednessProfile.findUnique({
      where: { userId },
      include: PROFILE_INCLUDE,
    });
  }

  return profile as ProfileWithRelations;
}

function mapFamilyPlan(profile: ProfileWithRelations): VestaFamilyPlan {
  const plan = profile.familyPlan;
  return {
    members: Array.isArray(plan?.membersJson) ? (plan?.membersJson as unknown as VestaFamilyMember[]) : [],
    primaryMeetingPoint: plan?.primaryMeetingPoint ?? null,
    alternateMeetingPoint: plan?.alternateMeetingPoint ?? null,
    evacuationRouteNotes: plan?.evacuationRouteNotes ?? null,
    medicalNeedsNotes: plan?.medicalNeedsNotes ?? null,
    petsNotes: plan?.petsNotes ?? null,
    observations: plan?.observations ?? null,
    updatedAt: plan?.updatedAt?.toISOString() ?? null,
  };
}

function mapChecklistItem(item: ProfileWithRelations["checklistItems"][number]): VestaChecklistItem {
  return {
    id: item.id,
    category: item.category as VestaChecklistItem["category"],
    label: item.label,
    status: item.status as VestaChecklistStatus,
    isCustom: item.isCustom,
    notes: item.notes,
    expiresAt: item.expiresAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function mapEmergencyContact(contact: ProfileWithRelations["emergencyContacts"][number]): VestaEmergencyContact {
  return {
    id: contact.id,
    name: contact.name,
    relationship: contact.relationship,
    phone: contact.phone,
    email: contact.email,
    priority: contact.priority,
  };
}

function mapReminder(reminder: ProfileWithRelations["reminders"][number]): VestaReminder {
  return {
    id: reminder.id,
    type: reminder.type as VestaReminderType,
    title: reminder.title,
    dueAt: reminder.dueAt.toISOString(),
    frequencyDays: reminder.frequencyDays,
    status: reminder.status as VestaReminderStatus,
    lastCompletedAt: reminder.lastCompletedAt?.toISOString() ?? null,
  };
}

export function toVestaProfileSummary(
  profile: ProfileWithRelations,
  extraRiskContexts: VestaThreatType[] = []
): VestaProfileSummary {
  const checklist = profile.checklistItems.map(mapChecklistItem);
  const storedRiskContexts = Array.isArray(profile.riskContextsJson)
    ? (profile.riskContextsJson as unknown as VestaThreatType[])
    : [];
  const riskContexts = Array.from(new Set([...storedRiskContexts, ...extraRiskContexts]));

  return {
    hasProfile: true,
    lastFullReviewAt: profile.lastFullReviewAt?.toISOString() ?? null,
    riskContexts,
    overallPercentage: calculateVestaOverallPercentage(checklist),
    categoryProgress: calculateVestaCategoryProgress(checklist),
    checklist,
    familyPlan: mapFamilyPlan(profile),
    emergencyContacts: profile.emergencyContacts.map(mapEmergencyContact),
    reminders: profile.reminders.map(mapReminder),
  };
}
