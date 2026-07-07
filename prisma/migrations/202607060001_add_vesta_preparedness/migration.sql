-- ARGUS VESTA: preparacion familiar, mochila de emergencia y resiliencia.
-- Non-destructive migration: creates new tables and indexes only.

CREATE TABLE "PreparednessProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "riskContextsJson" JSONB,
  "lastFullReviewAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PreparednessProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PreparednessProfile_userId_key" ON "PreparednessProfile"("userId");

CREATE TABLE "FamilyPlan" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "membersJson" JSONB,
  "primaryMeetingPoint" TEXT,
  "alternateMeetingPoint" TEXT,
  "evacuationRouteNotes" TEXT,
  "medicalNeedsNotes" TEXT,
  "petsNotes" TEXT,
  "observations" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FamilyPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FamilyPlan_profileId_key" ON "FamilyPlan"("profileId");

CREATE TABLE "EmergencyContact" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "relationship" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmergencyContact_profileId_idx" ON "EmergencyContact"("profileId");

CREATE TABLE "PreparednessChecklistItem" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "isCustom" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PreparednessChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PreparednessChecklistItem_profileId_idx" ON "PreparednessChecklistItem"("profileId");
CREATE INDEX "PreparednessChecklistItem_category_idx" ON "PreparednessChecklistItem"("category");
CREATE INDEX "PreparednessChecklistItem_status_idx" ON "PreparednessChecklistItem"("status");

CREATE TABLE "PreparednessReminder" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "frequencyDays" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "lastCompletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PreparednessReminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PreparednessReminder_profileId_idx" ON "PreparednessReminder"("profileId");
CREATE INDEX "PreparednessReminder_dueAt_idx" ON "PreparednessReminder"("dueAt");
CREATE INDEX "PreparednessReminder_status_idx" ON "PreparednessReminder"("status");

ALTER TABLE "PreparednessProfile" ADD CONSTRAINT "PreparednessProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FamilyPlan" ADD CONSTRAINT "FamilyPlan_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PreparednessProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PreparednessProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PreparednessChecklistItem" ADD CONSTRAINT "PreparednessChecklistItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PreparednessProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PreparednessReminder" ADD CONSTRAINT "PreparednessReminder_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PreparednessProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
