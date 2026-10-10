-- AlterTable
ALTER TABLE "post_targets" ADD COLUMN     "approval_mod_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "approval_mod_claimed_until" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "profile_groups" ADD COLUMN     "removal_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "removal_claimed_until" TIMESTAMP(3),
ADD COLUMN     "removal_error" TEXT,
ADD COLUMN     "removal_requested_at" TIMESTAMP(3),
ADD COLUMN     "removed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "facebook_suspension" TEXT,
ADD COLUMN     "suspended_at" TIMESTAMP(3),
ADD COLUMN     "suspension_detail" TEXT;

