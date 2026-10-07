-- AlterTable
ALTER TABLE "automation_settings" ADD COLUMN     "article_min_words_per_page" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "article_paragraphs_per_page" INTEGER NOT NULL DEFAULT 2;
