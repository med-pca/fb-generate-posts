-- AlterTable
ALTER TABLE "automation_settings" ADD COLUMN     "engagement_review" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "visuals" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "target_group_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];


-- Les visuels existants sont déjà publiés (ou l'ont été) : validés.
UPDATE "visuals" SET "approved_at" = "created_at" WHERE "approved_at" IS NULL;
