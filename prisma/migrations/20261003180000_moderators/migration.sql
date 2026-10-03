-- Les réglages et la présence des profils modérateurs.
ALTER TABLE "profiles" ADD COLUMN "moderator_paused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "moderator_run_at" TIMESTAMP(3),
ADD COLUMN "moderator_batch" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "moderator_every_minutes" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN "moderator_members" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "moderator_seen_at" TIMESTAMP(3),
ADD COLUMN "moderator_agent" TEXT;
