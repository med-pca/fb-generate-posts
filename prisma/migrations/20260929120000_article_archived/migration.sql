-- Un article dont un post a été publié est archivé : plus de nouveau post.
ALTER TABLE "articles" ADD COLUMN "archived_at" TIMESTAMP(3);

-- Les articles déjà publiés le sont d'emblée.
UPDATE "articles" a SET "archived_at" = sub.first_published
FROM (
  SELECT p."article_id", COALESCE(MIN(pt."published_at"), NOW()) AS first_published
  FROM "post_targets" pt
  JOIN "posts" p ON p."id" = pt."post_id"
  WHERE pt."status" = 'PUBLISHED' AND p."article_id" IS NOT NULL
  GROUP BY p."article_id"
) sub
WHERE sub."article_id" = a."id" AND a."archived_at" IS NULL;
