-- CreateTable
CREATE TABLE "ignored_articles" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ignored_articles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ignored_articles_source_id_external_id_key" ON "ignored_articles"("source_id", "external_id");

-- AddForeignKey
ALTER TABLE "ignored_articles" ADD CONSTRAINT "ignored_articles_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "content_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

