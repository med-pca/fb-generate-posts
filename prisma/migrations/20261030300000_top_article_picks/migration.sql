-- CreateTable
CREATE TABLE "top_article_picks" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image" TEXT,
    "domain" TEXT NOT NULL,
    "views" INTEGER NOT NULL,
    "viral" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "top_article_picks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "top_article_picks_day_url_key" ON "top_article_picks"("day", "url");
CREATE INDEX "top_article_picks_user_id_day_idx" ON "top_article_picks"("user_id", "day");
CREATE INDEX "top_article_picks_url_idx" ON "top_article_picks"("url");

-- AddForeignKey
ALTER TABLE "top_article_picks" ADD CONSTRAINT "top_article_picks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
