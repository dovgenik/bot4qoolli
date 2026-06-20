-- AlterTable
ALTER TABLE "User" ADD COLUMN     "crmLeadId" INTEGER,
ADD COLUMN     "crmSynced" BOOLEAN NOT NULL DEFAULT false;
