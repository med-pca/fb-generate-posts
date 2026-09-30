-- AlterTable
ALTER TABLE "automation_settings" ADD COLUMN     "daily_target" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "objective_end" INTEGER NOT NULL DEFAULT 1320,
ADD COLUMN     "objective_start" INTEGER NOT NULL DEFAULT 480,
ADD COLUMN     "objective_timezone" TEXT NOT NULL DEFAULT 'Europe/Paris';

