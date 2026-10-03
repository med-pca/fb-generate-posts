-- CreateEnum
CREATE TYPE "VerifyStatus" AS ENUM ('OK', 'REPUBLISHED', 'NEEDS_ACTION');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "is_moderator" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "post_targets" ADD COLUMN     "republish_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verified_at" TIMESTAMP(3),
ADD COLUMN     "verify_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verify_claimed_until" TIMESTAMP(3),
ADD COLUMN     "verify_detail" TEXT,
ADD COLUMN     "verify_status" "VerifyStatus";

-- CreateIndex
CREATE INDEX "post_targets_status_verify_status_idx" ON "post_targets"("status", "verify_status");

