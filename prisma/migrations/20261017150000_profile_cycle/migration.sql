-- AlterTable
ALTER TABLE "automation_settings" ADD COLUMN     "cycle_max_posts" INTEGER,
ADD COLUMN     "cycle_pause_hours" INTEGER NOT NULL DEFAULT 12;

-- AlterTable
ALTER TABLE "profile_runners" ADD COLUMN     "cycle_max_posts" INTEGER,
ADD COLUMN     "cycle_pause_hours" INTEGER,
ADD COLUMN     "cycle_started_at" TIMESTAMP(3),
ADD COLUMN     "rest_until" TIMESTAMP(3);

