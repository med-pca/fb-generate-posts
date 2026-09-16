-- Retenir quel commentaire porte quel post, et lesquels attendent leur lien.
ALTER TABLE "publication_job_items"
  ADD COLUMN "comment_external_id" TEXT,
  ADD COLUMN "commented_at" TIMESTAMP(3),
  ADD COLUMN "link_updated_at" TIMESTAMP(3);

ALTER TABLE "post_targets"
  ADD COLUMN "comment_external_id" TEXT,
  ADD COLUMN "commented_at" TIMESTAMP(3),
  ADD COLUMN "link_updated_at" TIMESTAMP(3);
