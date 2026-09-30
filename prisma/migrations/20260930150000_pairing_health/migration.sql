-- AlterTable
ALTER TABLE "profile_runners" ADD COLUMN     "key_reject_reason" TEXT,
ADD COLUMN     "key_rejected_at" TIMESTAMP(3),
ADD COLUMN     "paired_external_id" TEXT,
ADD COLUMN     "paired_key_hash" TEXT;

