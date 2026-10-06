-- Rubrique Visuels : des images seules à publier (capturées ou importées).
-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "visual_id" TEXT;

-- CreateTable
CREATE TABLE "visuals" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "hashtags" TEXT[],
    "language" TEXT,
    "category_id" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'upload',
    "ingest_id" TEXT,
    "details" JSONB,
    "owner_id" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visuals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visuals_created_at_idx" ON "visuals"("created_at");

-- CreateIndex
CREATE INDEX "visuals_owner_id_idx" ON "visuals"("owner_id");

-- CreateIndex
CREATE INDEX "posts_visual_id_idx" ON "posts"("visual_id");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_visual_id_fkey" FOREIGN KEY ("visual_id") REFERENCES "visuals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visuals" ADD CONSTRAINT "visuals_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visuals" ADD CONSTRAINT "visuals_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

