-- AlterTable
ALTER TABLE "automation_settings" ADD COLUMN     "adaptive_pacing" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "min_post_gap_minutes" INTEGER NOT NULL DEFAULT 5;
