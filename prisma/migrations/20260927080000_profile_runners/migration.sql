-- Le pilotage des profils depuis l'admin : un interrupteur, une fenêtre
-- horaire, des réglages poussés, et l'état rapporté par le terrain.
--
-- Une table à part plutôt que des colonnes sur `profiles` : ces lignes sont
-- écrites à chaque battement (toutes les minutes, par profil), et un profil
-- n'a pas à être touché pour cela.

CREATE TYPE "RunnerMode" AS ENUM ('OFF', 'ON', 'AUTO');
CREATE TYPE "BrowserState" AS ENUM ('STOPPED', 'STARTING', 'RUNNING', 'ERROR');

ALTER TABLE "automation_settings"
  ADD COLUMN "publishing_enabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "profile_runners" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "mode" "RunnerMode" NOT NULL DEFAULT 'OFF',
    "window_start" INTEGER,
    "window_end" INTEGER,
    "days" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "settings" JSONB,
    "last_seen_at" TIMESTAMP(3),
    "running" BOOLEAN NOT NULL DEFAULT false,
    "phase" TEXT,
    "message" TEXT,
    "published" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "links" INTEGER NOT NULL DEFAULT 0,
    "agent" TEXT,
    "browser_state" "BrowserState" NOT NULL DEFAULT 'STOPPED',
    "browser_seen_at" TIMESTAMP(3),
    "browser_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "profile_runners_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "profile_runners_profile_id_key" ON "profile_runners"("profile_id");
CREATE INDEX "profile_runners_mode_idx" ON "profile_runners"("mode");

ALTER TABLE "profile_runners" ADD CONSTRAINT "profile_runners_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
