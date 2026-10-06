-- Règles du pilotage : plafond et heures par groupe, quota par profil.
ALTER TABLE "groups" ADD COLUMN "daily_cap" INTEGER;
ALTER TABLE "groups" ADD COLUMN "hours_start" INTEGER;
ALTER TABLE "groups" ADD COLUMN "hours_end" INTEGER;
ALTER TABLE "profile_runners" ADD COLUMN "daily_quota" INTEGER;
