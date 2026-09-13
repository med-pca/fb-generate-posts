-- CreateTable
CREATE TABLE "content_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "origin_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "content_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "json_url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "meta_description" TEXT,
    "article_url" TEXT NOT NULL,
    "cover_image_url" TEXT,
    "course" TEXT,
    "cuisine" TEXT,
    "servings" TEXT,
    "prep_minutes" INTEGER,
    "cook_minutes" INTEGER,
    "total_minutes" INTEGER,
    "calories" INTEGER,
    "published_at" TIMESTAMP(3),
    "captions" JSONB NOT NULL,
    "hashtags" TEXT[],
    "image_prompt" TEXT,
    "raw_data" JSONB NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "posts" ADD COLUMN "article_id" TEXT,
ADD COLUMN "social_angle" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "content_sources_origin_url_key" ON "content_sources"("origin_url");
CREATE UNIQUE INDEX "articles_source_id_external_id_key" ON "articles"("source_id", "external_id");
CREATE UNIQUE INDEX "articles_source_id_slug_key" ON "articles"("source_id", "slug");
CREATE INDEX "articles_published_at_idx" ON "articles"("published_at");
CREATE INDEX "posts_article_id_idx" ON "posts"("article_id");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "content_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "posts" ADD CONSTRAINT "posts_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
