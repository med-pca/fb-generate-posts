-- L'identité Facebook de nos profils, et ce que le vérificateur fait pour eux
-- dans les groupes (accepter l'adhésion, pré-approuver les posts).

ALTER TABLE "profiles" ADD COLUMN "facebook_user_id" TEXT,
ADD COLUMN "facebook_name" TEXT,
ADD COLUMN "facebook_seen_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "profiles_facebook_user_id_key" ON "profiles"("facebook_user_id");

ALTER TABLE "profile_groups" ADD COLUMN "member_approved_at" TIMESTAMP(3),
ADD COLUMN "pre_approved_at" TIMESTAMP(3),
ADD COLUMN "member_action_error" TEXT,
ADD COLUMN "member_action_at" TIMESTAMP(3),
ADD COLUMN "member_claimed_until" TIMESTAMP(3),
ADD COLUMN "member_attempts" INTEGER NOT NULL DEFAULT 0;
