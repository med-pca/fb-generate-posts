-- Statut d'adhésion d'un profil (compte Facebook) à un groupe, mis à jour par
-- l'extension navigateur qui rejoint les groupes.
CREATE TYPE "JoinStatus" AS ENUM ('NOT_JOINED', 'REQUESTED', 'JOINED', 'QUESTIONS', 'FAILED');

ALTER TABLE "profile_groups"
  ADD COLUMN "join_status" "JoinStatus" NOT NULL DEFAULT 'NOT_JOINED',
  ADD COLUMN "join_checked_at" TIMESTAMP(3),
  ADD COLUMN "join_error" TEXT;

CREATE INDEX "profile_groups_profile_id_join_status_idx" ON "profile_groups"("profile_id", "join_status");
