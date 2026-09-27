-- Un site de contenu devient aussi une destination : l'extension choisit où
-- déposer, et chaque site porte la clé de son propre plugin.
ALTER TABLE "content_sources"
  ADD COLUMN "deposit_key" TEXT,
  ADD COLUMN "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX "content_sources_status_idx" ON "content_sources"("status");
