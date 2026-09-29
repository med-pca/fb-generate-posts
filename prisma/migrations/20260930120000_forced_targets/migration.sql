-- AlterTable
ALTER TABLE "post_targets" ADD COLUMN     "forced_at" TIMESTAMP(3),
ADD COLUMN     "forced_profile_id" TEXT;

-- CreateIndex
CREATE INDEX "post_targets_forced_profile_id_idx" ON "post_targets"("forced_profile_id");

-- AddForeignKey
ALTER TABLE "post_targets" ADD CONSTRAINT "post_targets_forced_profile_id_fkey" FOREIGN KEY ("forced_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

