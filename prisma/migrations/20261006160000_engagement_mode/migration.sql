-- Mode « engagement » : langue des groupes, image traduite, posts sans commentaire.
ALTER TABLE "groups" ADD COLUMN "language" TEXT;
ALTER TABLE "automation_settings" ADD COLUMN "image_provider" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "source_ingests" ADD COLUMN "target_language" TEXT;
ALTER TABLE "posts" ADD COLUMN "no_comment" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "generated_images" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "ingest_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "generated_images_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "generated_images_token_key" ON "generated_images"("token");
