-- Rythme humain du modérateur : heures de travail et plafonds d'actions.
ALTER TABLE "profiles" ADD COLUMN "moderator_window_start" INTEGER NOT NULL DEFAULT 540;
ALTER TABLE "profiles" ADD COLUMN "moderator_window_end" INTEGER NOT NULL DEFAULT 1320;
ALTER TABLE "profiles" ADD COLUMN "moderator_timezone" TEXT NOT NULL DEFAULT 'Europe/Paris';
ALTER TABLE "profiles" ADD COLUMN "moderator_hourly_limit" INTEGER NOT NULL DEFAULT 12;
ALTER TABLE "profiles" ADD COLUMN "moderator_daily_limit" INTEGER NOT NULL DEFAULT 60;
-- Les modérateurs restés sur l'ancien rythme (5 actions toutes les 10 min,
-- 24 h/24) passent à un rythme prudent : 3 actions environ toutes les 25 min.
UPDATE "profiles" SET "moderator_batch" = 3, "moderator_every_minutes" = 25
  WHERE "is_moderator" = true AND "moderator_batch" = 5 AND "moderator_every_minutes" = 10;
ALTER TABLE "profiles" ALTER COLUMN "moderator_batch" SET DEFAULT 3;
ALTER TABLE "profiles" ALTER COLUMN "moderator_every_minutes" SET DEFAULT 25;
