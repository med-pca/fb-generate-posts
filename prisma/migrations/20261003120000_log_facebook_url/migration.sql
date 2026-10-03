-- Le lien Facebook dans le journal, pour filtrer et retrouver par lien.
ALTER TABLE "activity_logs" ADD COLUMN "facebook_url" TEXT;

CREATE INDEX "activity_logs_post_target_id_created_at_idx" ON "activity_logs"("post_target_id", "created_at");
CREATE INDEX "activity_logs_group_id_created_at_idx" ON "activity_logs"("group_id", "created_at");
CREATE INDEX "activity_logs_facebook_url_idx" ON "activity_logs"("facebook_url");

-- Reprise : les publications déjà journalisées reçoivent le lien connu de
-- leur publication.
UPDATE "activity_logs" l
SET "facebook_url" = t."facebook_url"
FROM "post_targets" t
WHERE l."post_target_id" = t."id" AND t."facebook_url" IS NOT NULL AND l."facebook_url" IS NULL;
