-- La file de publication : priorité d'abord, puis le plus ancien.
ALTER TABLE "posts" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "posts_priority_created_at_idx" ON "posts"("priority", "created_at");
