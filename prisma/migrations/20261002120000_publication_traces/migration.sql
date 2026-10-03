-- L'adresse Facebook de chaque publication, et son historique.

ALTER TABLE "post_targets" ADD COLUMN "facebook_url" TEXT;

CREATE TABLE "publication_traces" (
    "id" TEXT NOT NULL,
    "post_target_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "facebook_url" TEXT,
    "actor" TEXT,
    "profile_id" TEXT,
    "job_id" TEXT,
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_traces_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "publication_traces_post_target_id_created_at_idx" ON "publication_traces"("post_target_id", "created_at");
CREATE INDEX "publication_traces_facebook_url_idx" ON "publication_traces"("facebook_url");

ALTER TABLE "publication_traces" ADD CONSTRAINT "publication_traces_post_target_id_fkey" FOREIGN KEY ("post_target_id") REFERENCES "post_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reprise : l'adresse de la dernière publication réussie de chaque cible.
UPDATE "post_targets" t
SET "facebook_url" = i."external_post_url"
FROM (
    SELECT DISTINCT ON ("post_target_id") "post_target_id", "external_post_url"
    FROM "publication_job_items"
    WHERE "status" = 'PUBLISHED' AND "external_post_url" IS NOT NULL
    ORDER BY "post_target_id", "published_at" DESC NULLS LAST
) i
WHERE t."id" = i."post_target_id" AND t."status" = 'PUBLISHED';

-- Reprise de l'historique : chaque publication réussie déjà enregistrée.
INSERT INTO "publication_traces" ("id", "post_target_id", "kind", "facebook_url", "actor", "profile_id", "job_id", "detail", "created_at")
SELECT
    'bk' || md5(i."id" || ':published'),
    i."post_target_id",
    'PUBLISHED',
    i."external_post_url",
    p."name",
    j."profile_id",
    i."job_id",
    CASE WHEN i."external_post_url" IS NULL THEN 'publié sans adresse Facebook (reprise)' ELSE 'reprise de l’historique' END,
    COALESCE(i."published_at", i."updated_at")
FROM "publication_job_items" i
JOIN "publication_jobs" j ON j."id" = i."job_id"
JOIN "profiles" p ON p."id" = j."profile_id"
WHERE i."status" = 'PUBLISHED';
