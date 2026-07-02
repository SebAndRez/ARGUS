-- Add basic profile location and preference fields.
ALTER TABLE "User" ADD COLUMN "city" TEXT;
ALTER TABLE "User" ADD COLUMN "region" TEXT;
ALTER TABLE "User" ADD COLUMN "preferredLanguage" TEXT;
ALTER TABLE "User" ADD COLUMN "unitSystem" TEXT;
