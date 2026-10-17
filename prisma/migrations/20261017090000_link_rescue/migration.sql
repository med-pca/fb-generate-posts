-- AlterTable
ALTER TABLE "post_targets" ADD COLUMN     "rescue_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rescue_claimed_until" TIMESTAMP(3),
ADD COLUMN     "rescue_detail" TEXT,
ADD COLUMN     "rescue_done_at" TIMESTAMP(3),
ADD COLUMN     "rescue_profile_id" TEXT,
ADD COLUMN     "rescue_requested_at" TIMESTAMP(3),
ADD COLUMN     "rescue_status" TEXT,
ADD COLUMN     "rescue_tried_by" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "post_targets_rescue_status_idx" ON "post_targets"("rescue_status");

