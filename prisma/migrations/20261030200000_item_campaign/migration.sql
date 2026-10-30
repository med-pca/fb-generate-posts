-- AlterTable
ALTER TABLE "publication_job_items" ADD COLUMN "campaign_id" TEXT;

-- CreateIndex
CREATE INDEX "publication_job_items_campaign_id_status_published_at_idx" ON "publication_job_items"("campaign_id", "status", "published_at");

-- AddForeignKey
ALTER TABLE "publication_job_items" ADD CONSTRAINT "publication_job_items_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
