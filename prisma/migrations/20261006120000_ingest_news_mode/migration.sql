-- Capture en mode « news » : notre propre article, depuis l’image et l’actualité.
ALTER TABLE "source_ingests" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'rewrite';
