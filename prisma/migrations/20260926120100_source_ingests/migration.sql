-- Reprise d'une publication Facebook : collecte par l'extension, lecture de
-- la page source, réécriture, dépôt WordPress, puis retour du plugin qui
-- rattache l'article produit.

-- CreateEnum
CREATE TYPE "IngestStatus" AS ENUM ('PENDING_SCRAPE', 'SCRAPING', 'SCRAPED', 'REWRITING', 'REWRITTEN', 'PUBLISHING', 'AWAITING_ECHO', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "source_ingests" (
    "id" TEXT NOT NULL,
    "facebook_url" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "site_url" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "fb_caption" TEXT,
    "fb_image_url" TEXT,
    "source_title" TEXT,
    "source_text" TEXT,
    "generated" JSONB,
    "wp_post_id" TEXT,
    "wp_permalink" TEXT,
    "article_id" TEXT,
    "profile_ids" TEXT[],
    "group_ids" TEXT[],
    "status" "IngestStatus" NOT NULL DEFAULT 'PENDING_SCRAPE',
    "claimed_at" TIMESTAMP(3),
    "claim_expires_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_ingests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Un article ne provient que d'une reprise : le retour du plugin ne peut pas
-- en rattacher deux.
CREATE UNIQUE INDEX "source_ingests_article_id_key" ON "source_ingests"("article_id");

-- La file d'attente se lit par état, du plus ancien au plus récent.
CREATE INDEX "source_ingests_status_created_at_idx" ON "source_ingests"("status", "created_at");

-- AddForeignKey
-- Supprimer l'article ne supprime pas la trace de la reprise : elle garde le
-- post d'origine et le texte collecté.
ALTER TABLE "source_ingests" ADD CONSTRAINT "source_ingests_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
