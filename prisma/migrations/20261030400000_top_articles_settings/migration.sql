-- AlterTable
ALTER TABLE "users" ADD COLUMN "top_articles" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "automation_settings" ADD COLUMN "top_articles_per_user" INTEGER NOT NULL DEFAULT 10;
