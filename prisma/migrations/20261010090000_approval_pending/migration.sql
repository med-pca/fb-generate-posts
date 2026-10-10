-- AlterTable
ALTER TABLE "post_targets" ADD COLUMN     "approval_checked_at" TIMESTAMP(3),
ADD COLUMN     "approval_checks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "approval_pending_since" TIMESTAMP(3);
