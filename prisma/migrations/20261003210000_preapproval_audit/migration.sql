-- Contrôle de la pré-approbation de nos profils par le modérateur.
ALTER TABLE "profile_groups" ADD COLUMN "audit_requested_at" TIMESTAMP(3),
ADD COLUMN "audit_mode" TEXT,
ADD COLUMN "audit_claimed_until" TIMESTAMP(3),
ADD COLUMN "pre_approval_state" TEXT,
ADD COLUMN "pre_approval_checked_at" TIMESTAMP(3),
ADD COLUMN "pre_approval_detail" TEXT;
