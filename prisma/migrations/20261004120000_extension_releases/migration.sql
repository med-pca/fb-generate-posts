-- L'historique des versions de nos extensions Chrome (téléchargement et
-- sauvegarde).
CREATE TABLE "extension_releases" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "file_count" INTEGER NOT NULL,
    "files" JSONB NOT NULL,
    "notes" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extension_releases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "extension_releases_key_version_key" ON "extension_releases"("key", "version");
CREATE INDEX "extension_releases_key_created_at_idx" ON "extension_releases"("key", "created_at");
