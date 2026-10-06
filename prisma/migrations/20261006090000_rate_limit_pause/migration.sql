-- Pause d'un profil limité par Facebook, et sa durée par défaut.
ALTER TABLE "automation_settings" ADD COLUMN "rate_limit_pause_days" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "profile_runners" ADD COLUMN "paused_until" TIMESTAMP(3);
ALTER TABLE "profile_runners" ADD COLUMN "pause_reason" TEXT;
