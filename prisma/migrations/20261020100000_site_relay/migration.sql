-- AlterTable
ALTER TABLE "content_sources" ADD COLUMN     "pause_reason" TEXT,
ADD COLUMN     "paused_at" TIMESTAMP(3),
ADD COLUMN     "redirect_error" TEXT,
ADD COLUMN     "redirect_since" TIMESTAMP(3),
ADD COLUMN     "relay_id" TEXT;

-- CreateTable
CREATE TABLE "article_copies" (
    "id" TEXT NOT NULL,
    "source_article_id" TEXT NOT NULL,
    "target_site_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "slug" TEXT,
    "wp_post_id" TEXT,
    "permalink" TEXT,
    "new_article_id" TEXT,
    "moved_posts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_copies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "article_copies_target_site_id_status_idx" ON "article_copies"("target_site_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "article_copies_source_article_id_target_site_id_key" ON "article_copies"("source_article_id", "target_site_id");

-- AddForeignKey
ALTER TABLE "content_sources" ADD CONSTRAINT "content_sources_relay_id_fkey" FOREIGN KEY ("relay_id") REFERENCES "content_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_copies" ADD CONSTRAINT "article_copies_source_article_id_fkey" FOREIGN KEY ("source_article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_copies" ADD CONSTRAINT "article_copies_target_site_id_fkey" FOREIGN KEY ("target_site_id") REFERENCES "content_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_copies" ADD CONSTRAINT "article_copies_new_article_id_fkey" FOREIGN KEY ("new_article_id") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

